# Medical SSO Test Portal

This standalone page simulates an external medical system. It is not a public
registration or credential issuance service and must not be deployed to a public
web root. It uses the backend repository's `scripts/medical_sso_test_server.py`.

Run the server on lab loopback, with a private mode-600 JSON configuration outside
Git. Set the backend medical validation URL to that server's `/verify` endpoint.
The validation bearer secret and dashboard HMAC key must stay on the server.
Never enable the Spring mock controller on a public server.

Forward the loopback service to the workstation:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:5180:127.0.0.1:18086 lab-server
```

Open `http://127.0.0.1:5180/`. Configure `testOrigins` to match the local portal
origin and `frontendOrigin` to match the running frontend. Test credentials expire
after ten minutes. Restarting the simulator revokes its outstanding external
tokens. Existing platform sessions still expire independently.

Use a dedicated published dashboard and allowlist its code in the backend. Each
data source must have an explicit department field mapping. The two demo identities
are synthetic; their departments use real calculated results. Test valid catalog
and signed entry, invalid token, incorrect signature, department isolation, and
denied management API access. Remove the simulator and disable its integration
when replacing it with the real medical system.
