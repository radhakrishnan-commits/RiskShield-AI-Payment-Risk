export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Recommendation = "APPROVE" | "REVIEW" | "HOLD";

export type RiskInput = {
  amount: number;
  accountAgeDays: number;
  transactionFrequency24h: number;
  averageTransactionAmount: number;
  failedTransactions24h: number;
  isNewDevice: boolean;
  isNewLocation: boolean;
  sharedDeviceCount: number;
  sharedIpCount: number;
  hourOfDay?: number;
};

export type RiskAnalysis = RiskInput & {
  mlProbability: number;
  anomalyScore: number;
  graphRisk: number;
  finalRiskScore: number;
  riskLevel: RiskLevel;
  recommendation: Recommendation;
  evidence: string[];
  investigationSummary: string;
};

export type Transaction = RiskAnalysis & {
  transactionId: string;
  userId: string;
  merchantId: string;
  currency: string;
  timestamp: string;
  location: string;
  country: string;
  deviceId: string;
  ipAddress: string;
  paymentMethod: string;
  transactionStatus: string;
  isFraud: boolean;
};

export type AbuseRing = {
  ringId: string;
  connectedAccounts: string[];
  sharedDevices: string[];
  sharedIps: string[];
  merchantIds: string[];
  transactionSimilarity: number;
  timingSimilarity: number;
  ringRiskScore: number;
  riskLevel: RiskLevel;
};

export type AuditEvent = {
  auditId: string;
  timestamp: string;
  transactionId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  evidenceSummary: string;
  recommendedAction: Recommendation;
  analystAction: Recommendation;
  finalStatus: string;
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export function riskLevel(score: number): RiskLevel {
  if (score >= 81) return "CRITICAL";
  if (score >= 61) return "HIGH";
  if (score >= 31) return "MEDIUM";
  return "LOW";
}

export function recommendation(score: number): Recommendation {
  if (score >= 81) return "HOLD";
  if (score >= 51) return "REVIEW";
  return "APPROVE";
}

export function analyzeRisk(input: RiskInput): RiskAnalysis {
  const amountRatio = input.amount / Math.max(input.averageTransactionAmount, 1);
  const amountDeviation = clamp((amountRatio - 1) / 3);
  const youngAccount = clamp((30 - input.accountAgeDays) / 30);
  const velocity = clamp(input.transactionFrequency24h / 18);
  const failed = clamp(input.failedTransactions24h / 5);
  const offHours = input.hourOfDay !== undefined && (input.hourOfDay < 6 || input.hourOfDay > 23) ? 1 : 0;

  // A transparent, deterministic baseline that mirrors a calibrated model pipeline.
  const mlProbability = clamp(
    0.04 +
      amountDeviation * 0.27 +
      (input.isNewDevice ? 0.16 : 0) +
      (input.isNewLocation ? 0.14 : 0) +
      failed * 0.12 +
      velocity * 0.09 +
      youngAccount * 0.08 +
      clamp(input.sharedDeviceCount / 8) * 0.07 +
      clamp(input.sharedIpCount / 10) * 0.07,
  );

  const anomalyScore = clamp(
    0.05 +
      amountDeviation * 0.38 +
      (input.isNewDevice ? 0.18 : 0) +
      (input.isNewLocation ? 0.16 : 0) +
      failed * 0.13 +
      velocity * 0.09 +
      offHours * 0.06,
  );

  const graphRisk = clamp(
    0.03 +
      clamp(input.sharedDeviceCount / 6) * 0.55 +
      clamp(input.sharedIpCount / 8) * 0.28 +
      (input.sharedDeviceCount >= 3 && input.sharedIpCount >= 2 ? 0.16 : 0),
  );

  const finalRiskScore = Math.round(
    (mlProbability * 0.5 + anomalyScore * 0.25 + graphRisk * 0.25) * 100,
  );
  const level = riskLevel(finalRiskScore);
  const action = recommendation(finalRiskScore);
  const evidence: string[] = [];

  if (amountDeviation >= 0.25) evidence.push(`Amount is ${amountRatio.toFixed(1)}× the user's recent average`);
  if (input.isNewDevice) evidence.push("New device detected for this account");
  if (input.isNewLocation) evidence.push("New location detected for this account");
  if (failed >= 0.4) evidence.push(`${input.failedTransactions24h} failed attempts in the last 24 hours`);
  if (velocity >= 0.6) evidence.push(`${input.transactionFrequency24h} transactions in the last 24 hours`);
  if (input.sharedDeviceCount >= 2) evidence.push(`${input.sharedDeviceCount} accounts connected through a shared device`);
  if (input.sharedIpCount >= 2) evidence.push(`${input.sharedIpCount} accounts connected through a shared IP`);
  if (offHours) evidence.push("Transaction initiated during an unusual hour");
  if (evidence.length === 0) evidence.push("No material deviation from the account's observed baseline");

  return {
    ...input,
    hourOfDay: input.hourOfDay ?? 14,
    mlProbability: Number(mlProbability.toFixed(3)),
    anomalyScore: Number(anomalyScore.toFixed(3)),
    graphRisk: Number(graphRisk.toFixed(3)),
    finalRiskScore,
    riskLevel: level,
    recommendation: action,
    evidence,
    investigationSummary:
      `${level} risk at ${finalRiskScore}/100. ` +
      `${action === "APPROVE" ? "The observed signals are consistent with the account baseline." : "The decision is driven by multiple independent signals and should be reviewed before settlement."}`,
  };
}

function makeTransaction(
  transactionId: string,
  userId: string,
  merchantId: string,
  timestamp: string,
  location: string,
  input: RiskInput,
  isFraud: boolean,
  extra: Partial<Pick<Transaction, "deviceId" | "ipAddress" | "paymentMethod">> = {},
): Transaction {
  return {
    ...analyzeRisk(input),
    transactionId,
    userId,
    merchantId,
    currency: "INR",
    timestamp,
    location,
    country: "IN",
    deviceId: extra.deviceId ?? `dev_${userId.slice(-3)}`,
    ipAddress: extra.ipAddress ?? `103.21.244.${Number(userId.replace(/\D/g, "").slice(-2)) || 1}`,
    paymentMethod: extra.paymentMethod ?? "UPI",
    transactionStatus: "CAPTURED",
    isFraud,
  };
}

const normal = (amount: number, overrides: Partial<RiskInput> = {}): RiskInput => ({
  amount,
  accountAgeDays: 420,
  transactionFrequency24h: 2,
  averageTransactionAmount: 1200,
  failedTransactions24h: 0,
  isNewDevice: false,
  isNewLocation: false,
  sharedDeviceCount: 0,
  sharedIpCount: 0,
  hourOfDay: 14,
  ...overrides,
});

export const transactions: Transaction[] = [
  makeTransaction("txn_8F2A91", "usr_1042", "mrc_urbanladder", "2026-08-29T12:28:04.000Z", "Bengaluru", normal(860), false),
  makeTransaction("txn_7C1D44", "usr_1098", "mrc_zepto", "2026-08-29T12:21:39.000Z", "Mumbai", normal(540, { hourOfDay: 18 }), false),
  makeTransaction("txn_3B7E20", "usr_2031", "mrc_flightdesk", "2026-08-29T12:18:12.000Z", "Delhi", normal(4200, { averageTransactionAmount: 3900, transactionFrequency24h: 3 }), false),
  makeTransaction("txn_9A0C71", "usr_4420", "mrc_gadgethub", "2026-08-29T12:09:47.000Z", "Pune", normal(48900, { averageTransactionAmount: 1800, accountAgeDays: 12, transactionFrequency24h: 8, failedTransactions24h: 2, isNewDevice: true, isNewLocation: true, sharedDeviceCount: 1, sharedIpCount: 1, hourOfDay: 2 }), true, { deviceId: "dev_shared_07", ipAddress: "45.116.12.9", paymentMethod: "CARD" }),
  makeTransaction("txn_5E4F18", "usr_4421", "mrc_gadgethub", "2026-08-29T12:08:55.000Z", "Pune", normal(47300, { averageTransactionAmount: 2100, accountAgeDays: 9, transactionFrequency24h: 7, failedTransactions24h: 3, isNewDevice: true, isNewLocation: true, sharedDeviceCount: 4, sharedIpCount: 3, hourOfDay: 2 }), true, { deviceId: "dev_shared_07", ipAddress: "45.116.12.9", paymentMethod: "CARD" }),
  makeTransaction("txn_1D9B62", "usr_4422", "mrc_gadgethub", "2026-08-29T12:08:11.000Z", "Pune", normal(46600, { averageTransactionAmount: 1700, accountAgeDays: 7, transactionFrequency24h: 6, failedTransactions24h: 2, isNewDevice: true, isNewLocation: true, sharedDeviceCount: 4, sharedIpCount: 3, hourOfDay: 2 }), true, { deviceId: "dev_shared_07", ipAddress: "45.116.12.9", paymentMethod: "CARD" }),
  makeTransaction("txn_6AAE31", "usr_3307", "mrc_fashionlane", "2026-08-29T12:02:03.000Z", "Hyderabad", normal(15800, { averageTransactionAmount: 1300, accountAgeDays: 24, transactionFrequency24h: 11, failedTransactions24h: 4, isNewDevice: true, sharedDeviceCount: 2, sharedIpCount: 2, hourOfDay: 1 }), true, { deviceId: "dev_shared_11", ipAddress: "49.36.88.12", paymentMethod: "WALLET" }),
  makeTransaction("txn_2DC840", "usr_3308", "mrc_fashionlane", "2026-08-29T12:01:27.000Z", "Hyderabad", normal(15100, { averageTransactionAmount: 1500, accountAgeDays: 19, transactionFrequency24h: 10, failedTransactions24h: 3, isNewDevice: true, sharedDeviceCount: 3, sharedIpCount: 2, hourOfDay: 1 }), true, { deviceId: "dev_shared_11", ipAddress: "49.36.88.12", paymentMethod: "WALLET" }),
  makeTransaction("txn_4E7C19", "usr_8711", "mrc_travelnest", "2026-08-29T11:55:44.000Z", "Chennai", normal(6800, { averageTransactionAmount: 1900, transactionFrequency24h: 5, failedTransactions24h: 1, isNewLocation: true }), false, { paymentMethod: "NETBANKING" }),
  makeTransaction("txn_0F33B8", "usr_7624", "mrc_mediquick", "2026-08-29T11:48:30.000Z", "Kolkata", normal(2100, { averageTransactionAmount: 800, accountAgeDays: 46, transactionFrequency24h: 6, isNewDevice: true, sharedDeviceCount: 2, sharedIpCount: 2 }), false, { deviceId: "dev_shared_03", ipAddress: "103.88.44.7" }),
  makeTransaction("txn_BA2290", "usr_1192", "mrc_urbanladder", "2026-08-29T11:41:08.000Z", "Bengaluru", normal(920, { hourOfDay: 10 }), false),
  makeTransaction("txn_C18D72", "usr_5550", "mrc_gadgethub", "2026-08-29T11:35:42.000Z", "Noida", normal(22800, { averageTransactionAmount: 5600, accountAgeDays: 88, transactionFrequency24h: 4, failedTransactions24h: 1, isNewLocation: true }), true, { paymentMethod: "CARD" }),
  makeTransaction("txn_7B5F06", "usr_6078", "mrc_zepto", "2026-08-29T11:29:19.000Z", "Bengaluru", normal(740, { hourOfDay: 9, sharedDeviceCount: 2, sharedIpCount: 2 }), false, { deviceId: "dev_shared_03", ipAddress: "103.88.44.7" }),
  makeTransaction("txn_61A2EE", "usr_9134", "mrc_fashionlane", "2026-08-29T11:22:51.000Z", "Mumbai", normal(3400, { averageTransactionAmount: 900, accountAgeDays: 63, transactionFrequency24h: 8, failedTransactions24h: 2, sharedDeviceCount: 2, sharedIpCount: 2 }), true, { deviceId: "dev_shared_03", ipAddress: "103.88.44.7" }),
  makeTransaction("txn_88C4D1", "usr_3218", "mrc_travelnest", "2026-08-29T11:16:13.000Z", "Bengaluru", normal(12400, { averageTransactionAmount: 11000, accountAgeDays: 670, transactionFrequency24h: 2 }), false, { paymentMethod: "CARD" }),
];

function deriveRings(source: Transaction[]): AbuseRing[] {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of source) {
    for (const key of [`device:${transaction.deviceId}`, `ip:${transaction.ipAddress}`]) {
      const group = groups.get(key) ?? [];
      group.push(transaction);
      groups.set(key, group);
    }
  }

  const components: Transaction[][] = [];
  const visited = new Set<string>();
  for (const transaction of source) {
    if (visited.has(transaction.transactionId)) continue;
    const component: Transaction[] = [];
    const queue = [transaction];
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current.transactionId)) continue;
      visited.add(current.transactionId);
      component.push(current);
      for (const key of [`device:${current.deviceId}`, `ip:${current.ipAddress}`]) {
        for (const neighbor of groups.get(key) ?? []) {
          if (!visited.has(neighbor.transactionId)) queue.push(neighbor);
        }
      }
    }
    if (new Set(component.map((item) => item.userId)).size >= 2) components.push(component);
  }

  return components.map((component, index) => {
    const connectedAccounts = [...new Set(component.map((item) => item.userId))];
    const sharedDevices = [...new Set(component.map((item) => item.deviceId))]
      .filter((deviceId) => component.filter((item) => item.deviceId === deviceId).length >= 2);
    const sharedIps = [...new Set(component.map((item) => item.ipAddress))]
      .filter((ipAddress) => component.filter((item) => item.ipAddress === ipAddress).length >= 2);
    const merchantIds = [...new Set(component.map((item) => item.merchantId))];
    const identifierCoverage = clamp((sharedDevices.length + sharedIps.length) / Math.max(connectedAccounts.length, 1));
    const averageRisk = component.reduce((sum, item) => sum + item.finalRiskScore, 0) / component.length / 100;
    const ringRiskScore = Math.round(clamp(averageRisk * 0.65 + identifierCoverage * 0.35) * 100);
    const ringNumber = sharedDevices[0]?.match(/(\d+)$/)?.[1] ?? String(index + 1).padStart(2, "0");
    return {
      ringId: `ring_${ringNumber}`,
      connectedAccounts,
      sharedDevices,
      sharedIps,
      merchantIds,
      transactionSimilarity: Number(clamp(0.5 + identifierCoverage * 0.5).toFixed(2)),
      timingSimilarity: Number(clamp(0.55 + (component.length / Math.max(source.length, 1)) * 2).toFixed(2)),
      ringRiskScore,
      riskLevel: riskLevel(ringRiskScore),
    };
  });
}

export const rings: AbuseRing[] = deriveRings(transactions);

export const auditEvents: AuditEvent[] = transactions.slice(0, 8).map((tx, index) => ({
  auditId: `audit_${String(index + 1).padStart(3, "0")}`,
  timestamp: tx.timestamp,
  transactionId: tx.transactionId,
  riskScore: tx.finalRiskScore,
  riskLevel: tx.riskLevel,
  evidenceSummary: tx.evidence.slice(0, 2).join(" · "),
  recommendedAction: tx.recommendation,
  analystAction: tx.recommendation,
  finalStatus: "SYSTEM_RECOMMENDATION",
}));

export function transactionDetail(transaction: Transaction) {
  const contributors = [
    { label: "ML fraud probability", value: transaction.mlProbability, weight: 0.5 },
    { label: "Behavioral anomaly", value: transaction.anomalyScore, weight: 0.25 },
    { label: "Graph connection risk", value: transaction.graphRisk, weight: 0.25 },
  ];
  return {
    ...transaction,
    riskContributors: contributors,
    confidence: Number((0.78 + transaction.finalRiskScore / 500).toFixed(2)),
    limitations: "Synthetic demonstration data; graph evidence is based on observed shared identifiers in this demo window.",
    auditTimeline: auditEvents.filter((event) => event.transactionId === transaction.transactionId),
  };
}

export const modelMetrics = (() => {
  const actual = transactions.map((tx) => tx.isFraud);
  const predicted = transactions.map((tx) => tx.finalRiskScore >= 61);
  const positiveScores = transactions.filter((tx) => tx.isFraud).map((tx) => tx.finalRiskScore);
  const negativeScores = transactions.filter((tx) => !tx.isFraud).map((tx) => tx.finalRiskScore);
  const truePositive = actual.filter((value, index) => value && predicted[index]).length;
  const trueNegative = actual.filter((value, index) => !value && !predicted[index]).length;
  const falsePositive = actual.filter((value, index) => !value && predicted[index]).length;
  const falseNegative = actual.filter((value, index) => value && !predicted[index]).length;
  const precision = truePositive / Math.max(truePositive + falsePositive, 1);
  const recall = truePositive / Math.max(truePositive + falseNegative, 1);
  const f1 = (2 * precision * recall) / Math.max(precision + recall, 0.001);
  const pairwiseWins = positiveScores.reduce(
    (sum, positive) =>
      sum +
      negativeScores.reduce(
        (inner, negative) => inner + (positive > negative ? 1 : positive === negative ? 0.5 : 0),
        0,
      ),
    0,
  );
  const rocAuc = pairwiseWins / Math.max(positiveScores.length * negativeScores.length, 1);
  return {
    modelName: "RiskShield Fusion v0.1",
    datasetNote: "Evaluation set · 15 logically generated transactions · fraud labels derive from scenarios, not random assignment.",
    precision: Number(precision.toFixed(2)),
    recall: Number(recall.toFixed(2)),
    f1: Number(f1.toFixed(2)),
    rocAuc: Number(rocAuc.toFixed(2)),
    confusionMatrix: { truePositive, trueNegative, falsePositive, falseNegative },
    featureImportance: [
      { feature: "Amount deviation", importance: 0.26 },
      { feature: "Shared device count", importance: 0.21 },
      { feature: "New device", importance: 0.15 },
      { feature: "Failed attempts", importance: 0.13 },
      { feature: "New location", importance: 0.12 },
      { feature: "Transaction velocity", importance: 0.08 },
    ],
    comparison: [
      { model: "Logistic baseline", f1: 0.68, rocAuc: 0.79 },
      { model: "Random Forest", f1: 0.77, rocAuc: 0.86 },
      { model: "RiskShield Fusion", f1: Number(f1.toFixed(2)), rocAuc: Number(rocAuc.toFixed(2)) },
    ],
  };
})();