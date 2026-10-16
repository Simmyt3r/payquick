"""Standard VTU invariants and documented provider shape regression."""
import sys
from pathlib import Path
from unittest.mock import patch
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

from errors import ApiError
import vtu_provider as p
import vtu_service as v
import worker


def test_all_basic_services_present_independent_of_ai():
    c=p.catalog()
    assert [x["id"] for x in c["categories"]]==["airtime","data","tv"]
    assert c["manual_checkout"] and not c["requires_ai"]
    assert {x["id"] for x in c["categories"][0]["services"]}=={"mtn","airtel","glo","etisalat"}


def test_unknown_provider_rejected():
    with pytest.raises(ApiError):
        p.details("airtime","invalid")
    with pytest.raises(ApiError):
        p.details("crypto","mtn")


@pytest.mark.parametrize("category,value",[
    ("airtime","not a phone"),("data","1234"),
    ("tv","invalid-card"),("tv","12345"),
])
def test_invalid_beneficiary(category,value):
    with pytest.raises(ApiError):
        p.validate_beneficiary(category,value)


def test_plan_catalog_prices_come_from_provider_not_user():
    response={"content":{"variations":[
        {"variation_code":"mtn-1gb","name":"1GB / 7 days","variation_amount":"1000.00","fixedPrice":"Yes"},
        {"variation_code":"bad","name":"Bad price","variation_amount":"0","fixedPrice":"Yes"},
        {"variation_code":"flex","name":"Flexible plan","variation_amount":"1500.00","fixedPrice":"No"},
    ]}}
    with patch.object(p,"_public_get",return_value=response):
        results=p.variations("data","mtn-data")
    assert results["plans"]==[{"code":"mtn-1gb","name":"1GB / 7 days","amount_kobo":100000}]


def test_airtime_provider_payload_has_no_smart_meter_or_ai():
    with patch.object(p.vtpass,"_post",return_value={"code":"099"}) as req:
        p.buy_vtu(request_id="202610161200"+"a"*32,category="airtime",service_id="mtn",
            beneficiary="08011111111",phone="08011111111",amount_kobo=100000,variation_code=None)
    args=req.call_args
    assert args.args[0]=="pay"
    assert args.args[1]["serviceID"]=="mtn"
    assert args.args[1]["amount"]==1000
    assert "variation_code" not in args.args[1]
    assert "billersCode" not in args.args[1]


def test_tv_bouquet_includes_required_provider_fields():
    with patch.object(p.vtpass,"_post",return_value={"code":"099"}) as req:
        p.buy_vtu(request_id="202610161200"+"a"*32,category="tv",service_id="gotv",
            beneficiary="1212121212",phone="08011111111",amount_kobo=280000,
            variation_code="bouquet-code")
    payload=req.call_args.args[1]
    assert payload["serviceID"]=="gotv"
    assert payload["billersCode"]=="1212121212"
    assert payload["variation_code"]=="bouquet-code"
    assert payload["subscription_type"]=="change"


def test_tv_quote_requires_verified_customer_name():
    with patch.object(p.vtpass,"_post",return_value={
        "code":"000","content":{"Customer_Name":"A CUSTOMER"}
    }):
        assert p.verify_tv("gotv","1212121212")["customer_name"]=="A CUSTOMER"
    with patch.object(p.vtpass,"_post",return_value={"code":"000","content":{}}):
        with pytest.raises(ApiError):
            p.verify_tv("gotv","1212121212")


def test_success_evidence_checks_beneficiary_and_amount():
    original={"provider_request_id":"202610161200"+"a"*32,
              "beneficiary":"08011111111","amount_kobo":150000}
    good={
        "code":"000","requestId":original["provider_request_id"],
        "amount":1500,"content":{"transactions":{"unique_element":"08011111111","amount":"1500"}},
    }
    assert p.evidence(original,good) is None
    bad={**good,"amount":1200}
    assert p.evidence(original,bad)=="amount_mismatch"
    bad={**good,"requestId":"wrong"}
    assert p.evidence(original,bad)=="reference_mismatch"
    bad={**good,"content":{"transactions":{"unique_element":"09011111111","amount":1500}}}
    assert p.evidence(original,bad)=="beneficiary_mismatch"


def test_vtu_payments_off_by_default(monkeypatch):
    monkeypatch.delenv("VTU_VENDING_ENABLED",raising=False)
    with pytest.raises(ApiError):
        v.enabled()


def test_basic_worker_runs_if_advanced_electricity_off(monkeypatch):
    monkeypatch.setenv("VTU_VENDING_ENABLED","true")
    monkeypatch.setenv("ELECTRICITY_VENDING_ENABLED","false")
    with patch.object(worker.vtu_service,"process_once",return_value={"operation":"idle"}) as basic,\
         patch.object(worker.vending,"process_once") as advanced:
        result=worker.run_once()
    assert result["standard_vtu"]["operation"]=="idle"
    assert result["electricity"]["operation"]=="disabled"
    basic.assert_called_once()
    advanced.assert_not_called()
