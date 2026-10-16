# PQ-AI: Final Roadmap Capability

**Status: specification only. AI-driven transaction execution is not enabled.**

Customer input will be text or microphone speech:
- Buy 2000 naira electricity for my home meter.
- Fund my wallet with 5000.
- What is my wallet balance?
- Load my last token. (Only for verified remote-capable meters.)

Speech-to-text and language understanding produce a suggested action, not a payment.
The Flask API will resolve customer-owned meters, apply fixed pricing rules, show a final quote, require explicit customer approval and step-up authentication, then execute through the normal transaction engine. No language model may write ledger rows directly.

Planned tool interface:
- prepare_electricity_purchase(saved_meter_id, amount_naira)
- prepare_wallet_funding(amount_naira)
- get_wallet_balance()
- get_order_status(reference)
- request_meter_load(saved_meter_id, existing_purchase_reference)

Reject ambiguous meter names, unverified payment changes, malformed speech recognition, expired approvals, non-owner references and injection attempts. Keep provider and AI API secrets off mobile devices. Any spoken full token requires the customer's explicit request in a suitable private setting.

Start with Nigerian English; benchmark Nigerian Pidgin, Hausa, Yoruba and Igbo on real accent/command evaluations before enabling payments in each language.
