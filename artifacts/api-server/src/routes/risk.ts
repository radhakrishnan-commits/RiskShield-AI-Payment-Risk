import { Router, type IRouter } from "express";
import {
  AnalyzeRiskBody,
  GetAlertsResponse,
  GetDashboardSummaryResponse,
  GetModelMetricsResponse,
  GetRingParams,
  GetRingResponse,
  GetRingsResponse,
  GetTransactionParams,
  GetTransactionResponse,
  GetTransactionsQueryParams,
  GetTransactionsResponse,
  GetAuditResponse,
  RecordAnalystActionBody,
  RecordAnalystActionResponse,
  SimulateRiskBody,
  SimulateRiskResponse,
} from "@workspace/api-zod";
import {
  analyzeRisk,
  auditEvents,
  modelMetrics,
  rings,
  transactionDetail,
  transactions,
  type Recommendation,
} from "../risk/data";

const router: IRouter = Router();

router.get("/dashboard/summary", (_req, res) => {
  const highRisk = transactions.filter((tx) => tx.finalRiskScore >= 61);
  const critical = transactions.filter((tx) => tx.finalRiskScore >= 81);
  const fraudAmountDetected = transactions.filter((tx) => tx.isFraud).reduce((sum, tx) => sum + tx.amount, 0);
  const falsePositiveCost = transactions.filter((tx) => !tx.isFraud && tx.recommendation !== "APPROVE").length * 180;
  const estimatedProtectedValue = fraudAmountDetected * 0.82;
  const summary = {
    totalTransactions: transactions.length,
    highRiskAlerts: highRisk.length,
    criticalAlerts: critical.length,
    amountAtRisk: highRisk.reduce((sum, tx) => sum + tx.amount, 0),
    activeAbuseRings: rings.length,
    netProtectedValue: Math.max(0, estimatedProtectedValue - falsePositiveCost),
    fraudAmountDetected,
    estimatedProtectedValue,
    falsePositiveCost,
    riskTrend: [
      { label: "08:00", high: 1, critical: 0 },
      { label: "09:00", high: 1, critical: 1 },
      { label: "10:00", high: 2, critical: 1 },
      { label: "11:00", high: 3, critical: 2 },
      { label: "12:00", high: highRisk.length - 1, critical: critical.length },
    ],
    riskDistribution: [
      { label: "Low", value: transactions.filter((tx) => tx.riskLevel === "LOW").length },
      { label: "Medium", value: transactions.filter((tx) => tx.riskLevel === "MEDIUM").length },
      { label: "High", value: transactions.filter((tx) => tx.riskLevel === "HIGH").length },
      { label: "Critical", value: critical.length },
    ],
    topContributors: [
      { label: "New device", count: transactions.filter((tx) => tx.isNewDevice).length, share: 0.31 },
      { label: "Amount deviation", count: transactions.filter((tx) => tx.amount > tx.averageTransactionAmount * 2).length, share: 0.26 },
      { label: "Shared identifiers", count: transactions.filter((tx) => tx.sharedDeviceCount >= 2 || tx.sharedIpCount >= 2).length, share: 0.23 },
      { label: "Failed attempts", count: transactions.filter((tx) => tx.failedTransactions24h > 0).length, share: 0.2 },
    ],
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/transactions", (req, res) => {
  const query = GetTransactionsQueryParams.parse(req.query);
  const search = query.search?.toLowerCase();
  const result = transactions
    .filter((tx) => !search || [tx.transactionId, tx.userId, tx.merchantId, tx.location].some((value) => value.toLowerCase().includes(search)))
    .filter((tx) => !query.riskLevel || tx.riskLevel === query.riskLevel)
    .filter((tx) => !query.status || tx.recommendation === query.status)
    .slice(0, query.limit);
  res.json(GetTransactionsResponse.parse(result));
});

router.get("/transactions/:transactionId", (req, res) => {
  const params = GetTransactionParams.parse(req.params);
  const transaction = transactions.find((tx) => tx.transactionId === params.transactionId);
  if (!transaction) return res.status(404).json({ error: "Transaction not found" });
  return res.json(GetTransactionResponse.parse(transactionDetail(transaction)));
});

router.get("/alerts", (_req, res) => {
  const alerts = transactions
    .filter((tx) => tx.finalRiskScore >= 61)
    .slice(0, 5)
    .map((tx, index) => ({
      alertId: `alert_${index + 1}`,
      transactionId: tx.transactionId,
      title: tx.riskLevel === "CRITICAL" ? "Coordinated payment pattern" : "Behavioral deviation detected",
      description: tx.evidence.slice(0, 2).join(" · "),
      riskScore: tx.finalRiskScore,
      riskLevel: tx.riskLevel,
      timestamp: tx.timestamp,
    }));
  res.json(GetAlertsResponse.parse(alerts));
});

router.get("/rings", (_req, res) => res.json(GetRingsResponse.parse(rings)));

router.get("/rings/:ringId", (req, res) => {
  const params = GetRingParams.parse(req.params);
  const ring = rings.find((item) => item.ringId === params.ringId);
  if (!ring) return res.status(404).json({ error: "Abuse ring not found" });
  return res.json(GetRingResponse.parse(ring));
});

router.get("/model/metrics", (_req, res) => res.json(GetModelMetricsResponse.parse(modelMetrics)));

router.post("/risk/analyze", (req, res) => {
  const input = AnalyzeRiskBody.parse(req.body);
  const result = analyzeRisk(input);
  res.json(result);
});

router.post("/simulate", (req, res) => {
  const input = SimulateRiskBody.parse(req.body);
  const result = analyzeRisk(input);
  const changedFactors: string[] = [];
  if (input.amount / input.averageTransactionAmount > 2) changedFactors.push("Amount is materially above baseline");
  if (input.isNewDevice) changedFactors.push("New device");
  if (input.isNewLocation) changedFactors.push("New location");
  if (input.transactionFrequency24h >= 8) changedFactors.push("Elevated transaction velocity");
  if (input.failedTransactions24h >= 2) changedFactors.push("Failed attempts");
  const response = {
    originalRiskScore: input.originalRiskScore,
    simulatedRiskScore: result.finalRiskScore,
    riskChange: result.finalRiskScore - input.originalRiskScore,
    riskLevel: result.riskLevel,
    changedFactors,
    explanation: changedFactors.length
      ? `${changedFactors.join(", ")} ${changedFactors.length === 1 ? "pushes" : "push"} the fused risk score to ${result.finalRiskScore}/100.`
      : "No simulation inputs materially change the current risk posture.",
  };
  res.json(SimulateRiskResponse.parse(response));
});

router.get("/audit", (_req, res) => res.json(GetAuditResponse.parse(auditEvents)));

router.post("/audit/action", (req, res) => {
  const body = RecordAnalystActionBody.parse(req.body);
  const transaction = transactions.find((tx) => tx.transactionId === body.transactionId);
  if (!transaction) return res.status(404).json({ error: "Transaction not found" });
  const event = {
    auditId: `audit_live_${Date.now()}`,
    timestamp: new Date().toISOString(),
    transactionId: transaction.transactionId,
    riskScore: transaction.finalRiskScore,
    riskLevel: transaction.riskLevel,
    evidenceSummary: transaction.evidence.slice(0, 2).join(" · "),
    recommendedAction: transaction.recommendation,
    analystAction: body.analystAction as Recommendation,
    finalStatus: "ANALYST_DECISION",
  };
  auditEvents.unshift(event);
  return res.status(201).json(RecordAnalystActionResponse.parse(event));
});

export default router;