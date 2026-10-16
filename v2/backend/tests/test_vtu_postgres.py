"""PostgreSQL-backed conventional VTU flow, independent of advanced features."""
import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import create_app
from db import connect
from ledger import apply_wallet_delta
import vtu_provider
import vtu_service
import vtpass

pytestmark = pytest.mark.skipif(
    not os.getenv("CI_TEST_DATABASE") or not os.getenv("DATABASE_URL"),
    reason="Ephemeral CI PostgreSQL required",
)


def init(client,monkeypatch,*,category="airtime"):
    monkeypatch.setenv("JWT_SECRET","integration-vtu-"+"b"*64)
    monkeypatch.setenv("PAYMENTS_ENABLED","true")
    monkeypatch.setenv("VTU_VENDING_ENABLED","true")
    monkeypatch.setenv("ELECTRICITY_VENDING_ENABLED","false")
    monkeypatch.setenv("VTPASS_ENV","sandbox")
    monkeypatch.setenv("VTPASS_API_KEY","sandbox-api")
    monkeypatch.setenv("VTPASS_SECRET_KEY","sandbox-secret")
    password="CI-Secure-Password-For-VTU"
    response=client.post("/api/auth/register",json={
        "name":"Normal VTU Customer",
        "email":f"vtu-{uuid.uuid4().hex}@example.invalid",
        "password":password,
    })
    assert response.status_code==201,response.get_json()
    user=response.get_json()
    uid=user["user"]["id"]
    headers={"Authorization":"Bearer "+user["access_token"]}
    with connect() as conn:
        with conn.transaction(),conn.cursor() as cur:
            cur.execute("SELECT id FROM ledger_accounts WHERE code='paystack:clearing'")
            clearing=cur.fetchone()["id"]
            apply_wallet_delta(
                cur,user_id=uid,delta_kobo=1000000,contra_account=clearing,
                reference="vtu:testfund:"+uuid.uuid4().hex,kind="funding",
            )
    if category=="airtime":
        quote_payload={
            "category":"airtime","service_id":"mtn","beneficiary":"08011111111",
            "amount_naira":1000,
        }
    elif category=="data":
        monkeypatch.setattr(vtu_provider,"variations",lambda *_:{
            "plans":[{"code":"data-1gb","name":"1 GB","amount_kobo":100000}],
        })
        quote_payload={
            "category":"data","service_id":"mtn-data","beneficiary":"08011111111",
            "variation_code":"data-1gb",
        }
    else:
        monkeypatch.setattr(vtu_provider,"variations",lambda *_:{
            "plans":[{"code":"gotv-value","name":"GOtv Value","amount_kobo":200000}],
        })
        monkeypatch.setattr(vtu_provider,"verify_tv",lambda *_:{
            "customer_name":"VERIFIED DECODER CUSTOMER",
        })
        quote_payload={
            "category":"tv","service_id":"gotv","beneficiary":"1212121212",
            "contact_phone":"08011111111","variation_code":"gotv-value",
        }
    q=client.post("/api/vtu/quotes",json=quote_payload,headers=headers)
    assert q.status_code==201,q.get_json()
    quote=q.get_json()
    assert quote["manual_checkout"] is True
    assert quote["requires_ai"] is False
    idempotency=uuid.uuid4().hex
    body={"quote_id":quote["quote_id"],"idempotency_key":idempotency,
          "confirmation_password":password}
    first=client.post("/api/vtu/orders",json=body,headers=headers)
    assert first.status_code==201,first.get_json()
    oid=first.get_json()["order_id"]
    dup=client.post("/api/vtu/orders",json=body,headers=headers)
    assert dup.status_code==200 and dup.get_json()["duplicate"]
    other=client.post("/api/vtu/orders",json={
        **body,"idempotency_key":uuid.uuid4().hex,
    },headers=headers)
    assert other.status_code==409
    balance=client.get("/api/wallet",headers=headers).get_json()["balance_kobo"]
    assert balance==1000000-quote["total_kobo"]
    return headers,oid,quote


def make_success(order):
    return {
        "requestId":order["provider_request_id"],"code":"000",
        "amount":order["amount_kobo"]//100,
        "content":{"transactions":{
            "status":"delivered","unique_element":order["beneficiary"],
            "amount":str(order["amount_kobo"]//100),
            "transactionId":"testprovider-"+uuid.uuid4().hex,
        }},
    }


@pytest.mark.parametrize("category",["airtime","data","tv"])
def test_normal_checkout_success_without_any_ai_or_auto_meter(monkeypatch,category):
    client=create_app().test_client()
    headers,oid,quote=init(client,monkeypatch,category=category)
    monkeypatch.setattr(vtu_provider,"buy_vtu",lambda **kw: {
        "requestId":kw["request_id"],"code":"000",
        "amount":kw["amount_kobo"]//100,
        "content":{"transactions":{
            "status":"delivered","unique_element":kw["beneficiary"],
            "amount":kw["amount_kobo"]//100,
            "transactionId":"CI-"+uuid.uuid4().hex,
        }},
    })
    done=vtu_service.process_once()
    assert done["order_id"]==oid
    assert done["status"]=="delivered",done
    receipt=client.get("/api/vtu/orders/"+oid,headers=headers).get_json()
    assert receipt["status"]=="delivered"
    assert receipt["category"]==category
    assert receipt["beneficiary"]==quote["beneficiary"]
    assert client.get("/api/wallet",headers=headers).get_json()["balance_kobo"]==1000000-quote["total_kobo"]
    history=client.get("/api/vtu/orders",headers=headers)
    assert history.status_code==200
    assert any(x["id"]==oid for x in history.get_json()["orders"])


def test_uncertain_vend_only_requeries_and_refunds_once(monkeypatch):
    client=create_app().test_client()
    headers,oid,quote=init(client,monkeypatch)
    monkeypatch.setattr(vtu_provider,"buy_vtu",lambda **kw: {"code":"099"})
    pending=vtu_service.process_once()
    assert pending["status"]=="pending"
    with connect() as conn:
        with conn.transaction(),conn.cursor() as cur:
            cur.execute("UPDATE vtu_orders SET next_check_at=now() WHERE id=%s",(oid,))
    monkeypatch.setattr(vtpass,"requery",lambda reference:{
        "requestId":reference,"code":"016",
    })
    failed=vtu_service.process_once()
    assert failed["status"]=="failed"
    assert client.get("/api/wallet",headers=headers).get_json()["balance_kobo"]==1000000
    assert vtu_service.apply_result(oid,{"code":"016"},from_requery=True)=="failed"
    assert client.get("/api/wallet",headers=headers).get_json()["balance_kobo"]==1000000


def test_wrong_beneficiary_is_never_declared_delivered(monkeypatch):
    client=create_app().test_client()
    headers,oid,quote=init(client,monkeypatch)
    monkeypatch.setattr(vtu_provider,"buy_vtu",lambda **kw:{
        "code":"000","requestId":kw["request_id"],"amount":1000,
        "content":{"transactions":{
            "status":"delivered","amount":1000,
            "unique_element":"08099999999","transactionId":"invalid-recipient",
        }},
    })
    result=vtu_service.process_once()
    assert result["status"]=="manual_review"
    assert client.get("/api/vtu/orders/"+oid,headers=headers).get_json()["status"]=="manual_review"
    assert client.get("/api/wallet",headers=headers).get_json()["balance_kobo"]==900000


def test_no_provider_payment_while_disabled(monkeypatch):
    monkeypatch.setenv("PAYMENTS_ENABLED","true")
    monkeypatch.setenv("VTU_VENDING_ENABLED","false")
    with pytest.raises(Exception) as e:
        vtu_service.process_once()
    assert "unavailable" in str(e.value).lower()
