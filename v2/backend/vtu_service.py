"""Conventional VTU service: fixed-price quotes, wallet reservation and receipts.

Airtime/data/cable work independently of PQ-AI and meter auto-loading.
The provider controls plan prices; the server owns quotes and wallet debits.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

from db import connect
from errors import ApiError
from ledger import apply_wallet_delta, post_journal
from security import password_verify
from vending import valid_phone, valid_idempotency
import vtpass
import vtu_provider as provider


def enabled():
    if os.getenv("PAYMENTS_ENABLED") != "true" or os.getenv("VTU_VENDING_ENABLED") != "true":
        raise ApiError(503, "Standard VTU purchases are unavailable until provider certification")
    vtpass.environment()
    if not os.getenv("VTPASS_API_KEY") or not os.getenv("VTPASS_SECRET_KEY"):
        raise ApiError(503, "VTU provider credentials missing")


def make_quote(user_id, data):
    category = data.get("category")
    service = data.get("service_id")
    provider.details(category, service)
    beneficiary = provider.validate_beneficiary(category, data.get("beneficiary"))
    phone = data.get("contact_phone") or (beneficiary if category != "tv" else None)
    if not valid_phone(phone):
        raise ApiError(400, "Enter a valid Nigerian contact number")
    amount_kobo, variation, customer = None, None, None
    if category == "airtime":
        naira = data.get("amount_naira")
        if type(naira) is not int or not 100 <= naira <= 200000:
            raise ApiError(400, "Airtime amount must be 100 to 200,000 whole naira")
        amount_kobo = naira * 100
    else:
        variation = data.get("variation_code")
        options = provider.variations(category, service)["plans"]
        plan = next((x for x in options if x["code"] == variation), None)
        if not plan:
            raise ApiError(409, "Choose an available current provider plan")
        amount_kobo = plan["amount_kobo"]
        if category == "tv":
            customer = provider.verify_tv(service, beneficiary)["customer_name"]
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "INSERT INTO vtu_quotes(user_id,category,service_id,beneficiary,contact_phone,"
                "variation_code,amount_kobo,verified_customer_name,expires_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now()+interval '8 minutes') "
                "RETURNING id,expires_at,total_kobo",
                (user_id,category,service,beneficiary,phone,variation,amount_kobo,customer),
            )
            quote = cur.fetchone()
    return {
        "quote_id":str(quote["id"]),"category":category,"service_id":service,
        "beneficiary":beneficiary,"contact_phone":phone,"variation_code":variation,
        "verified_customer_name":customer,"amount_kobo":amount_kobo,"fee_kobo":0,
        "total_kobo":quote["total_kobo"],"expires_at":quote["expires_at"].isoformat(),
        "execution_enabled":os.getenv("VTU_VENDING_ENABLED") == "true" and
        os.getenv("PAYMENTS_ENABLED") == "true",
        "manual_checkout":True,"requires_ai":False,
    }


def make_order(user_id, data):
    enabled()
    quote_id, idempotency = data.get("quote_id"), data.get("idempotency_key")
    password = data.get("confirmation_password")
    if not valid_idempotency(idempotency):
        raise ApiError(400, "A unique idempotency key is required")
    if not isinstance(password,str) or len(password)>200:
        raise ApiError(401, "Account password confirmation required")
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("SELECT password_hash FROM users WHERE id=%s",(user_id,))
            user=cur.fetchone()
            if not user or not password_verify(user["password_hash"],password):
                raise ApiError(401,"Transaction authorization failed")
            cur.execute(
                "SELECT id,quote_id,status FROM vtu_orders WHERE user_id=%s "
                "AND idempotency_key=%s FOR UPDATE",(user_id,idempotency),
            )
            previous=cur.fetchone()
            if previous:
                if str(previous["quote_id"]) != str(quote_id):
                    raise ApiError(409,"Idempotency key belongs to another quote")
                return {"order_id":str(previous["id"]),"status":previous["status"],"duplicate":True}
            cur.execute("SELECT * FROM vtu_quotes WHERE id=%s AND user_id=%s FOR UPDATE",(quote_id,user_id))
            quote=cur.fetchone()
            if not quote or quote["expires_at"]<=datetime.now(timezone.utc):
                raise ApiError(409,"Quote expired; request another")
            cur.execute("SELECT id FROM vtu_orders WHERE quote_id=%s",(quote_id,))
            if cur.fetchone():
                raise ApiError(409,"This quote is already used; check order history")
            cur.execute("INSERT INTO vtu_orders(user_id,quote_id,idempotency_key) "
                        "VALUES(%s,%s,%s) RETURNING id",(user_id,quote_id,idempotency))
            oid=cur.fetchone()["id"]
            cur.execute("SELECT id FROM ledger_accounts WHERE code='vtpass:suspense'")
            account=cur.fetchone()
            if not account:
                raise ApiError(503,"Ledger suspense account missing")
            apply_wallet_delta(
                cur,user_id=user_id,delta_kobo=-quote["total_kobo"],
                reference="vtu:reserve:"+str(oid),kind="purchase",contra_account=account["id"],
            )
    return {"order_id":str(oid),"status":"queued","duplicate":False}


def _full_order(cur, oid):
    cur.execute(
        "SELECT o.*,q.category,q.service_id,q.beneficiary,q.contact_phone,q.variation_code,"
        "q.amount_kobo,q.total_kobo,q.verified_customer_name "
        "FROM vtu_orders o JOIN vtu_quotes q ON q.id=o.quote_id "
        "WHERE o.id=%s FOR UPDATE OF o",(oid,),
    )
    return cur.fetchone()


def claim_dispatch():
    enabled()
    with connect() as conn:
        with conn.transaction(),conn.cursor() as cur:
            cur.execute(
                "SELECT o.id FROM vtu_orders o WHERE status='queued' "
                "AND next_check_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1"
            )
            row=cur.fetchone()
            if not row:
                return None
            ref=vtpass.request_id()
            cur.execute(
                "UPDATE vtu_orders SET status='submitting',provider_request_id=%s,"
                "attempts=attempts+1,next_check_at=now()+interval '3 minutes',"
                "updated_at=now() WHERE id=%s",(ref,row["id"]),
            )
            order=_full_order(cur,row["id"])
    return order


def claim_requery():
    enabled()
    with connect() as conn:
        with conn.transaction(),conn.cursor() as cur:
            cur.execute(
                "SELECT id,attempts,provider_request_id FROM vtu_orders "
                "WHERE status IN ('pending','submitting') AND provider_request_id IS NOT NULL "
                "AND next_check_at<=now() ORDER BY next_check_at "
                "FOR UPDATE SKIP LOCKED LIMIT 1"
            )
            row=cur.fetchone()
            if not row:
                return None
            if row["attempts"]>=24:
                cur.execute("UPDATE vtu_orders SET status='manual_review',updated_at=now() "
                            "WHERE id=%s",(row["id"],))
                return {**row,"escalated":True}
            cur.execute(
                "UPDATE vtu_orders SET attempts=attempts+1,"
                "next_check_at=now()+interval '5 minutes',updated_at=now() WHERE id=%s",
                (row["id"],),
            )
    return row


def mark_uncertain(oid):
    with connect() as conn:
        with conn.transaction(),conn.cursor() as cur:
            cur.execute("UPDATE vtu_orders SET status='pending',"
                        "next_check_at=now()+interval '5 minutes',updated_at=now() "
                        "WHERE id=%s AND status IN ('pending','submitting')",(oid,))


def apply_result(oid,response,*,from_requery):
    kind,_=vtpass.classify(response)
    with connect() as conn:
        with conn.transaction(),conn.cursor() as cur:
            order=_full_order(cur,oid)
            if not order:
                raise ApiError(404,"VTU order not found")
            if order["status"] in ("delivered","failed","manual_review"):
                return order["status"]
            if kind in ("delivered","failed") and (kind=="delivered" or from_requery):
                reason=provider.evidence(order,response,failure=kind=="failed")
                if reason:
                    cur.execute(
                        "UPDATE vtu_orders SET status='manual_review',provider_code=%s,updated_at=now() "
                        "WHERE id=%s",(str(response.get("code",""))[:12],oid),
                    )
                    return "manual_review"
            if kind=="delivered":
                tx=(response.get("content") or {}).get("transactions") or {}
                provider_id=str(tx.get("transactionId") or "") if isinstance(tx,dict) else ""
                if not provider_id:
                    cur.execute("UPDATE vtu_orders SET status='pending',"
                                "next_check_at=now()+interval '5 minutes',updated_at=now() "
                                "WHERE id=%s",(oid,))
                    return "pending"
                cur.execute("SELECT id FROM ledger_accounts WHERE code='vtpass:suspense'")
                suspense=cur.fetchone()["id"]
                cur.execute("SELECT id FROM ledger_accounts WHERE code='vtpass:clearing'")
                clearing=cur.fetchone()["id"]
                post_journal(
                    cur,reference="vtu:settle:"+str(oid),kind="purchase",
                    postings=[(suspense,-order["total_kobo"]),(clearing,order["total_kobo"])],
                )
                cur.execute(
                    "UPDATE vtu_orders SET status='delivered',provider_transaction_id=%s,"
                    "provider_code=%s,updated_at=now() WHERE id=%s",
                    (provider_id[:120],str(response.get("code",""))[:12],oid),
                )
                return "delivered"
            if kind=="failed" and from_requery:
                cur.execute("SELECT id FROM ledger_accounts WHERE code='vtpass:suspense'")
                suspense=cur.fetchone()["id"]
                apply_wallet_delta(
                    cur,user_id=order["user_id"],delta_kobo=order["total_kobo"],
                    reference="vtu:refund:"+str(oid),kind="refund",contra_account=suspense,
                )
                cur.execute(
                    "UPDATE vtu_orders SET status='failed',provider_code=%s,updated_at=now() WHERE id=%s",
                    (str(response.get("code",""))[:12],oid),
                )
                return "failed"
            cur.execute(
                "UPDATE vtu_orders SET status='pending',provider_code=%s,"
                "next_check_at=now()+interval '5 minutes',updated_at=now() WHERE id=%s",
                (str(response.get("code",""))[:12],oid),
            )
            return "pending"


def process_once():
    enabled()
    order=claim_dispatch()
    if order:
        try:
            response=provider.buy_vtu(
                request_id=order["provider_request_id"], category=order["category"],
                service_id=order["service_id"],beneficiary=order["beneficiary"],
                phone=order["contact_phone"],amount_kobo=order["amount_kobo"],
                variation_code=order["variation_code"],
            )
            status=apply_result(order["id"],response,from_requery=False)
        except vtpass.ProviderUncertain:
            mark_uncertain(order["id"])
            status="pending"
        return {"operation":"vtupay","order_id":str(order["id"]),"status":status}
    row=claim_requery()
    if row:
        if row.get("escalated"):
            return {"operation":"escalated","order_id":str(row["id"]),"status":"manual_review"}
        try:
            response=vtpass.requery(row["provider_request_id"])
            status=apply_result(row["id"],response,from_requery=True)
        except vtpass.ProviderUncertain:
            mark_uncertain(row["id"])
            status="pending"
        return {"operation":"vturequery","order_id":str(row["id"]),"status":status}
    return {"operation":"idle"}


def list_orders(user_id):
    with connect() as conn,conn.cursor() as cur:
        cur.execute(
            "SELECT o.id,o.status,o.created_at,q.category,q.service_id,q.beneficiary,"
            "q.amount_kobo,q.total_kobo FROM vtu_orders o "
            "JOIN vtu_quotes q ON q.id=o.quote_id WHERE o.user_id=%s "
            "ORDER BY o.created_at DESC LIMIT 50",(user_id,),
        )
        rows=cur.fetchall()
    return {"orders":[{
        "id":str(r["id"]),"category":r["category"],"service_id":r["service_id"],
        "beneficiary":r["beneficiary"],"amount_kobo":r["amount_kobo"],
        "total_kobo":r["total_kobo"],"status":r["status"],
        "created_at":r["created_at"].isoformat(),
    } for r in rows]}


def receipt(user_id,order_id):
    with connect() as conn,conn.cursor() as cur:
        cur.execute(
            "SELECT o.id,o.status,o.provider_request_id,o.created_at,"
            "q.category,q.service_id,q.beneficiary,q.amount_kobo,q.total_kobo "
            "FROM vtu_orders o JOIN vtu_quotes q ON q.id=o.quote_id "
            "WHERE o.id=%s AND o.user_id=%s",(order_id,user_id),
        )
        r=cur.fetchone()
    if not r:
        raise ApiError(404,"VTU order not found")
    return {
        "id":str(r["id"]),"status":r["status"],"reference":r["provider_request_id"],
        "category":r["category"],"service_id":r["service_id"],
        "beneficiary":r["beneficiary"],"amount_kobo":r["amount_kobo"],
        "total_kobo":r["total_kobo"],"created_at":r["created_at"].isoformat(),
        "message": {
            "delivered":"Provider confirmed purchase. Keep this receipt.",
            "failed":"Provider confirmed failure; reserved wallet funds were returned.",
            "manual_review":"Provider response requires support review; please do not purchase again yet.",
        }.get(r["status"],"Purchase pending; check status before retrying."),
    }
