import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from provider_evidence import naira_to_kobo, validate_provider_result


ORDER = {
    "provider_request_id": "202610161200" + "a" * 32,
    "meter_number": "1111111111111",
    "amount_kobo": 200000,
}


def success(**overrides):
    response = {
        "code": "000", "requestId": ORDER["provider_request_id"], "amount": 2000,
        "content": {"transactions": {
            "status": "delivered", "unique_element": ORDER["meter_number"],
            "amount": "2000", "total_amount": "1992.50",
        }},
    }
    response.update(overrides)
    return response


def test_exact_naira_arithmetic():
    assert naira_to_kobo("2000") == 200000
    assert naira_to_kobo("2000.01") == 200001
    assert naira_to_kobo(2000.005) is None
    assert naira_to_kobo(float("nan")) is None
    assert naira_to_kobo(True) is None
    assert naira_to_kobo("not a price") is None


def test_valid_success_ignores_merchant_commission_total():
    assert validate_provider_result(ORDER, success(), expected_kind="delivered") is None


def test_missing_provider_reference_is_not_trusted():
    response = success()
    del response["requestId"]
    assert validate_provider_result(ORDER, response, expected_kind="delivered") == "missing_or_mismatched_request_id"


def test_wrong_meter_rejected():
    response = success()
    response["content"]["transactions"]["unique_element"] = "2222222222222"
    assert validate_provider_result(ORDER, response, expected_kind="delivered") == "missing_or_mismatched_meter"


def test_wrong_amount_rejected():
    response = success(amount=1000)
    assert validate_provider_result(ORDER, response, expected_kind="delivered") == "incorrect_vend_amount"


def test_altered_nested_amount_rejected():
    response = success()
    response["content"]["transactions"]["amount"] = "2500.00"
    assert validate_provider_result(ORDER, response, expected_kind="delivered") == "incorrect_vend_amount"


def test_missing_amount_rejected():
    response = success()
    del response["amount"]
    del response["content"]["transactions"]["amount"]
    assert validate_provider_result(ORDER, response, expected_kind="delivered") == "missing_vend_amount"


def test_failure_requires_matched_request_id():
    assert validate_provider_result(ORDER, {"code": "016", "requestId": ORDER["provider_request_id"]}, expected_kind="failed") is None
    assert validate_provider_result(ORDER, {"code": "016"}, expected_kind="failed") == "missing_or_mismatched_request_id"
