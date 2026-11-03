# Owner admission: truthful failure classification

## Evidence and limit

Owner browser reported `/api/profile` with email owner@stage.lentaro.ru while the upload-test GET returned OWNER_SESSION_REQUIRED both top-level and inside VK. The latter response does not prove absent cookies: its catch-all maps every exception to401. A read-only check inside the actual web container confirmed configured owner email equals the reported profile (only a boolean was output); directly invoking requireOwnerProviderAccess for that identity passed. Nginx has no special cookie rule for this route. No session token/cookie was extracted, no permissions changed and no VK calls performed. The underlying failure of this particular browser request remains NOT_PROVEN.

## Minimal diagnostic correction

GET retains the exact existing authorization chain: requireApiOwner then requireOwnerProviderAccess. Completed authorization alone returns200 OWNER_SESSION_RECOGNIZED. UnauthorizedError reports401 OWNER_SESSION_REQUIRED; ForbiddenError/SessionAccessError reports403 OWNER_ACCESS_DENIED; other exceptions report503 ADMISSION_UNAVAILABLE. Fixed labels only, no exception text, stack, identity, URL or secrets returned; Cache-Control no-store. POST, owner gate and one-shot markers unchanged.

Client admission reporting preserves only matching fixed401/403 labels; other denials become ADMISSION_UNAVAILABLE. Every denial stops before browser claim or POST. Source tests cover success and all classifications, unknown errors and no secret reflection, no-claim/no-upload denials. Existing relay safeguards remain tested.

## Verification

- Missing implementation observed RED, then5 admission tests GREEN.
- Client403 misclassification observed RED, then5 client tests GREEN.
- Complete scoped diagnostic/relay suite:56 PASS.
- TypeScript and full Next build:PASS.
- Independent review: backend and client correction no remaining actionable findings.
- Source/CI/deployment are distinct. This change supplies evidence for diagnosis; it does not establish restored owner admission or successful VK upload.

Next: exact-head Linux CI, reviewed candidate build/release gate, then one read-only owner admission result. No auth relaxation or upload retry from this report.
