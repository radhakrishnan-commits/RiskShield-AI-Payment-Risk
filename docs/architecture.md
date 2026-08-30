# RISKSHIELD AI — Architecture

## Runtime flow

```text
Synthetic payment event
        |
        v
Data validation + feature engineering
        |
        +--> transaction-level ML probability
        |
        +--> behavioral anomaly score
        |      amount deviation
        |      new device/location
        |      velocity
        |      failed attempts
        |      unusual hour
        |
        +--> graph intelligence
               user -- device -- IP -- merchant -- transaction
               connected-account clusters
        |
        v
Risk Fusion Engine
  50% ML + 25% anomaly + 25% graph
        |
        v
Explainability Engine
  contributors + evidence list
        |
        v
Grounded Investigation Agent
  structured summary + confidence + limitations
        |
        v
Controlled analyst recommendation
  APPROVE / REVIEW / HOLD
        |
        v
Application-level audit event
```

## Backend modules

### Risk data and feature layer

`artifacts/api-server/src/risk/data.ts` owns the demonstration dataset and the pure risk calculation. It is intentionally deterministic so a judge can reload the app and see the same scenarios. The generated fields mirror a realistic payment event: amount, account age, velocity, failed attempts, device and location novelty, shared device/IP counts, merchant, and timestamp context.

### ML risk layer

The current build uses a transparent weighted baseline as a dependency-free stand-in for a serialized model artifact. It exposes the model probability, evaluates predictions against the generated scenario labels, and returns precision, recall, F1, confusion matrix, and pairwise ROC-AUC. A production implementation would train Logistic Regression / Random Forest / XGBoost in a Python service, save the selected artifact, and version its feature schema.

### Behavioral anomaly layer

The anomaly score uses normalized deviation from the account baseline and adds independent novelty, failed-attempt, velocity, and off-hours signals. In production this module can wrap Isolation Forest and should preserve the same explainable feature contributions.

### Graph intelligence layer

The demonstration rings are represented by shared-device, shared-IP, merchant, amount, and timing relationships. In production this should be materialized from an event graph or graph database, with account-level privacy controls, graph snapshots, and ring lifecycle state.

### Explainability and investigator layer

Every detail response returns the three engine contributions and an evidence list derived from the exact input fields. The investigation summary never receives free-form data and never invents a reason. Recommendations remain reversible and analyst-controlled.

## API boundary

The API contract is defined first in `lib/api-spec/openapi.yaml`; Orval generates the React Query client and Zod schemas. The Express routes parse request inputs and validate response shapes before returning them. This keeps the UI and service synchronized without duplicating request contracts.

## Persistence decision

This hackathon build uses an in-memory store so it runs without external credentials or a setup step. That is an explicit demo tradeoff, not a claim of production readiness. The next production increment would move transactions, ring snapshots, model versions, and audit events into PostgreSQL, add idempotency keys to analyst actions, and enforce immutable append-only audit storage.

## Security and responsible deployment

- Never send raw payment credentials to the investigator layer.
- Minimize and hash device/IP identifiers in analyst-facing views where possible.
- Keep model version, feature schema, and threshold configuration on every decision.
- Treat shared device/IP evidence as a review signal, not proof of intent.
- Require human approval for irreversible payment actions.
- Monitor false positives by merchant, geography, payment method, and customer cohort.