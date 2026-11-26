import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ExternalLink,
  LockKeyhole,
  TerminalSquare,
} from "lucide-react";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { McpTerminalDemo } from "../../_components/McpTerminalDemo";
import { getMcpTerminalCopy } from "../../_components/mcp-terminal-copy";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai"
  ).replace(/\/+$/, "");
}

const clients = [
  "ChatGPT",
  "Codex",
  "Claude Code",
  "Claude Desktop",
  "Cursor",
  "VS Code",
  "opencode",
];

type McpFeatureLocale =
  | "en"
  | "zh"
  | "zh-hant"
  | "ja"
  | "ko"
  | "de"
  | "fr"
  | "es"
  | "it"
  | "pt-BR";

type McpFeatureCopy = {
  title: string;
  description: string;
  eyebrow: string;
  connect: string;
  docs: string;
  supported: string;
  contractEyebrow: string;
  contractTitle: string;
  contractText: string;
  groups: [string, string][];
  workflowEyebrow: string;
  workflowTitle: string;
  workflowText: string;
  workflow: [string, string, string][];
  recipes: string;
  safetyTitle: string;
  safetyText: string;
  safety: string[];
  finalTitle: string;
  finalText: string;
};

const copy: Record<McpFeatureLocale, McpFeatureCopy> = {
  en: {
    title: "Your AI can read your training. You can see exactly how.",
    description:
      "Connect TrainingLoad to your AI client through a read-only, OAuth-protected MCP server. Ask a real training question, inspect every tool call, and verify the conclusion against returned data.",
    eyebrow: "TrainingLoad MCP",
    connect: "Connect MCP",
    docs: "Read the docs",
    supported: "Works with",
    contractEyebrow: "A product surface, not a raw API",
    contractTitle: "24 bounded tools. Three resources. Three reusable prompts.",
    contractText:
      "The server prefers an aggregate snapshot, then exposes narrower detail only when the question needs it. Every list has a time bound, a limit, and an opaque cursor.",
    groups: [
      ["Current state", "Snapshot, readiness indicators, and load series"],
      [
        "Progress",
        "Period comparison, sport breakdown, activity statistics, consistency, fitness, zones, and bests",
      ],
      [
        "Execution",
        "Activity zones and splits, plan summaries, adherence, and competition detail",
      ],
      ["Connections", "Sync readiness plus optional health context"],
    ],
    workflowEyebrow: "From connection to evidence",
    workflowTitle: "Add one URL, approve the data you want, then ask normally.",
    workflowText:
      "The client discovers OAuth and tools from the server. TrainingLoad keeps authorization and data boundaries on the server, while every answer remains inspectable in the conversation.",
    workflow: [
      [
        "01",
        "Add the server",
        "Use the same remote URL in any supported client.",
      ],
      ["02", "Review consent", "Approve read scopes; health remains separate."],
      [
        "03",
        "Ask a real question",
        "The client selects the smallest useful tool path.",
      ],
      [
        "04",
        "Verify the answer",
        "Inspect calls, ranges, returned facts, and missing data.",
      ],
    ],
    recipes: "See native prompts, resources, and tool paths",
    safetyTitle: "Private by construction",
    safetyText:
      "OAuth scopes are checked when tools are listed and again when they execute. Results exclude direct identity fields, raw sensor streams, precise routes, credentials, and complete FIT data.",
    safety: [
      "Read-only tools; no hidden write path",
      "Current athlete only; opaque IDs are user-scoped",
      "Untrusted notes are sanitized and never treated as instructions",
      "Schema validation, output budgets, timeouts, limits, audit, and traces",
    ],
    finalTitle: "Connect once. Ask in the client you already use.",
    finalText:
      "The same endpoint works across supported MCP clients. Health access remains optional and can be revoked with the rest of the connection from your account.",
  },
  zh: {
    title: "让你的 AI 读懂训练，也让你看清它是怎么得出结论的。",
    description:
      "通过只读、OAuth 保护的 MCP 服务，把 TrainingLoad 连接到你的 AI 客户端。提出真实训练问题，查看每一次工具调用，再用返回数据验证结论。",
    eyebrow: "TrainingLoad MCP",
    connect: "配置 MCP",
    docs: "查看文档",
    supported: "支持客户端",
    contractEyebrow: "不是裸 API，而是完整产品能力",
    contractTitle: "24 个有边界的工具，3 个 Resources，3 个可复用 Prompts。",
    contractText:
      "服务优先返回聚合快照，只有问题确实需要时才调用更细的工具。所有列表都有限定时间窗、limit 和 opaque cursor。",
    groups: [
      ["当前状态", "训练快照、readiness 指标与负荷时间序列"],
      [
        "进展变化",
        "周期比较、项目拆分、活动统计、一致性、体能趋势、区间与最佳成绩",
      ],
      ["计划执行", "活动 zones/splits、计划总结、完成率与比赛详情"],
      ["连接状态", "同步 readiness 与可选健康背景"],
    ],
    workflowEyebrow: "从连接到证据",
    workflowTitle: "添加一个地址，确认数据权限，然后像平常一样提问。",
    workflowText:
      "客户端从服务发现 OAuth 和工具。TrainingLoad 在服务端守住授权和数据边界，同时让每个答案都能在对话中核验。",
    workflow: [
      ["01", "添加服务", "所有支持的客户端都使用同一个远程地址。"],
      ["02", "确认授权", "批准只读 scopes；健康权限始终单独选择。"],
      ["03", "提出真实问题", "客户端选择能回答问题的最小工具组合。"],
      ["04", "核验答案", "查看调用、日期范围、返回事实与缺失数据。"],
    ],
    recipes: "查看原生 Prompts、Resources 与工具路径",
    safetyTitle: "从设计上保护隐私",
    safetyText:
      "OAuth scope 在工具列出时检查一次，执行时再次做权威校验。结果不包含直接身份字段、原始传感器流、精确路线、凭证或完整 FIT 数据。",
    safety: [
      "全部只读，没有隐藏写入路径",
      "仅当前运动员，opaque ID 绑定用户",
      "清理不可信备注，绝不把它当作指令",
      "Schema 校验、输出预算、超时、限流、审计与 tracing",
    ],
    finalTitle: "连接一次，就在你已经使用的客户端里提问。",
    finalText:
      "同一个端点适用于所有支持的 MCP 客户端。健康数据始终可选，也可以和整条连接一起从账号中撤销。",
  },
  "zh-hant": {
    title: "讓你的 AI 讀懂訓練，也讓你看清它是怎麼得出結論的。",
    description:
      "透過唯讀、受 OAuth 保護的 MCP 服務，將 TrainingLoad 連線到你的 AI 用戶端。提出真實訓練問題，檢視每一次工具呼叫，再用回傳資料驗證結論。",
    eyebrow: "TrainingLoad MCP",
    connect: "設定 MCP",
    docs: "閱讀文件",
    supported: "支援用戶端",
    contractEyebrow: "不是裸 API，而是完整產品介面",
    contractTitle: "24 個有邊界的工具、3 個 Resources、3 個可重複使用的 Prompts。",
    contractText:
      "服務優先回傳彙總快照，僅在問題確實需要時才揭露更細部的資料。每份清單都設有時間範圍、筆數上限與 opaque cursor。",
    groups: [
      ["目前狀態", "訓練快照、準備度指標與負荷時間序列"],
      [
        "進度變化",
        "週期比較、運動項目拆解、活動統計、訓練規律性、體能趨勢、區間與最佳成績",
      ],
      ["課表執行", "活動區間與分段、計畫總覽、執行率與賽事詳情"],
      ["連線狀態", "同步就緒度與可選的健康背景資料"],
    ],
    workflowEyebrow: "從連線到證據",
    workflowTitle: "加入一個網址，核准所需資料權限，接著照常提問。",
    workflowText:
      "用戶端會自動從伺服器探索 OAuth 與可用工具。TrainingLoad 在伺服器端把關授權與資料邊界，同時讓每個回答都能在對話中查驗。",
    workflow: [
      ["01", "加入伺服器", "在任何支援的用戶端使用同一個遠端網址。"],
      ["02", "確認授權範圍", "核准唯讀 scopes；健康資料權限一律分開授權。"],
      ["03", "提出真實問題", "用戶端會挑選足以回答問題的最小工具路徑。"],
      ["04", "查驗回答", "檢視工具呼叫、日期區間、回傳事實與缺漏資料。"],
    ],
    recipes: "查看原生 Prompts、Resources 與工具路徑",
    safetyTitle: "從架構層面保護隱私",
    safetyText:
      "列出工具時會檢查 OAuth scopes，執行工具時會再次進行權威驗證。回傳結果不含直接身分欄位、原始感測器串流、精確 GPS 路線、憑證或完整 FIT 資料。",
    safety: [
      "全部為唯讀工具，無任何隱藏寫入路徑",
      "僅限目前運動員，opaque ID 與使用者綁定",
      "會清理不受信任的備註內容，絕不視為指令執行",
      "具備 Schema 驗證、輸出預算、逾時、限流、稽核與追蹤機制",
    ],
    finalTitle: "連線一次，就能在你平常使用的用戶端裡直接提問。",
    finalText:
      "同一個端點適用於所有支援的 MCP 用戶端。健康資料存取始終為可選項，也可隨時在帳號設定中與整條連線一併撤銷。",
  },
  ja: {
    title: "AI があなたのトレーニングを読み解く。その根拠もすべて見える。",
    description:
      "読み取り専用・OAuth 保護の MCP サーバー経由で、TrainingLoad を普段お使いの AI クライアントに接続。実際のトレーニングの疑問を投げかけ、すべてのツール呼び出しを確認し、返却データで結論を検証できます。",
    eyebrow: "TrainingLoad MCP",
    connect: "MCP を接続",
    docs: "ドキュメントを読む",
    supported: "対応クライアント",
    contractEyebrow: "生の API ではなく、設計されたプロダクト体験",
    contractTitle: "24 の境界付きツール、3 つのリソース、3 つの再利用可能なプロンプト。",
    contractText:
      "サーバーはまず集約スナップショットを優先して返し、質問に本当に必要なときだけ詳細なデータへ掘り下げます。すべてのリストに期間上限・件数制限・opaque cursor を備えています。",
    groups: [
      ["現在の状態", "スナップショット、レディネス指標、トレーニング負荷の時系列"],
      [
        "成長・推移",
        "期間比較、種目別内訳、アクティビティ統計、継続性、フィットネス推移、ゾーン、自己ベスト",
      ],
      [
        "計画と実行",
        "アクティビティのゾーン・スプリット、計画サマリー、達成率、レース詳細",
      ],
      ["連携状態", "同期レディネスと任意のヘルスコンテキスト"],
    ],
    workflowEyebrow: "接続から根拠の確認まで",
    workflowTitle: "URL を 1 つ追加し、許可するデータを選ぶだけ。あとは普通に質問。",
    workflowText:
      "クライアントはサーバーから OAuth 設定とツール一覧を自動検出します。TrainingLoad がサーバー側で認可とデータ境界を守りながら、会話の中で全回答の根拠を検証できます。",
    workflow: [
      [
        "01",
        "サーバーを追加",
        "対応クライアントすべてで同じリモート URL を利用できます。",
      ],
      [
        "02",
        "権限を確認",
        "読み取りスコープを承認。ヘルスデータ権限は常に分離されています。",
      ],
      [
        "03",
        "具体的な質問をする",
        "クライアントが回答に必要な最小限のツール経路を選択します。",
      ],
      [
        "04",
        "結論を検証する",
        "呼び出し履歴、対象期間、返却された事実、欠損データを確認できます。",
      ],
    ],
    recipes: "ネイティブプロンプト・リソース・ツール経路を見る",
    safetyTitle: "設計段階からのプライバシー保護",
    safetyText:
      "OAuth スコープはツール一覧取得時と実行時の両方で検証されます。返却データには直接的な個人識別情報、生センサーストリーム、精密な GPS ルート、認証情報、完全な FIT データは一切含まれません。",
    safety: [
      "すべて読み取り専用ツール。隠し書き込み経路なし",
      "現在のアスリート本人のみに限定。opaque ID はユーザー単位でスコープ分離",
      "信頼できないメモはサニタイズされ、決して指示として解釈されない",
      "スキーマ検証、出力上限、タイムアウト、レート制限、監査ログ、トレースを標準実装",
    ],
    finalTitle: "一度接続すれば、いつもの AI クライアントからすぐ質問。",
    finalText:
      "同じエンドポイントが対応するすべての MCP クライアントで使えます。ヘルスデータの共有は任意であり、アカウント設定から接続全体とあわせていつでも取り消せます。",
  },
  ko: {
    title: "AI가 당신의 훈련을 읽고, 당신은 그 근거를 정확히 확인합니다.",
    description:
      "읽기 전용·OAuth로 보호되는 MCP 서버를 통해 TrainingLoad를 사용 중인 AI 클라이언트에 연결하세요. 실제 훈련 질문을 던지고 모든 도구 호출을 확인하며 반환된 데이터로 결론을 검증할 수 있습니다.",
    eyebrow: "TrainingLoad MCP",
    connect: "MCP 연결",
    docs: "문서 보기",
    supported: "지원 클라이언트",
    contractEyebrow: "단순한 원시 API가 아닌 완성된 제품 인터페이스",
    contractTitle: "경계가 명확한 24개 도구, 3개 리소스, 3개 재사용 프롬프트.",
    contractText:
      "서버는 먼저 집계 스냅샷을 우선 반환하고, 질문에 꼭 필요할 때만 세부 도구를 노출합니다. 모든 목록에는 기간 제한, 개수 제한, opaque cursor가 적용됩니다.",
    groups: [
      ["현재 상태", "훈련 스냅샷, 준비도 지표 및 훈련 부하 시계열"],
      [
        "진전 추이",
        "기간 비교, 종목별 분석, 활동 통계, 일관성, 피트니스 추세, 존 분포 및 최고 기록",
      ],
      [
        "계획 실행",
        "활동 존·스플릿, 훈련 계획 요약, 수행률 및 대회 상세 정보",
      ],
      ["연동 상태", "동기화 준비 상태 및 선택적 건강 컨텍스트"],
    ],
    workflowEyebrow: "연결에서 근거 검증까지",
    workflowTitle: "URL 하나를 추가하고 원하는 데이터만 승인한 뒤 평소처럼 질문하세요.",
    workflowText:
      "클라이언트가 서버에서 OAuth 설정과 도구 목록을 자동으로 탐색합니다. TrainingLoad는 서버 측에서 권한과 데이터 경계를 지키며, 모든 답변은 대화 안에서 직접 검증할 수 있습니다.",
    workflow: [
      [
        "01",
        "서버 추가",
        "지원되는 모든 클라이언트에서 동일한 원격 URL을 사용합니다.",
      ],
      [
        "02",
        "권한 검토",
        "읽기 전용 스코프를 승인하세요. 건강 데이터 권한은 별도로 분리됩니다.",
      ],
      [
        "03",
        "실제 질문하기",
        "클라이언트가 답변에 필요한 최소한의 도구 경로를 선택합니다.",
      ],
      [
        "04",
        "답변 검증",
        "호출 내역, 조회 기간, 반환된 사실과 누락된 데이터를 직접 확인합니다.",
      ],
    ],
    recipes: "네이티브 프롬프트, 리소스 및 도구 경로 보기",
    safetyTitle: "설계 단계부터 보장되는 프라이버시",
    safetyText:
      "OAuth 스코프는 도구 목록을 불러올 때와 실행할 때 모두 검증됩니다. 결과에는 직접 신원 정보, 원시 센서 스트림, 정밀 경로, 자격 증명 및 전체 FIT 데이터가 제외됩니다.",
    safety: [
      "모든 도구는 읽기 전용이며 숨겨진 쓰기 경로가 없음",
      "현재 선수 본인 데이터만 접근 가능, opaque ID는 사용자별로 격리",
      "신뢰할 수 없는 메모는 정제되며 절대 지시문으로 처리되지 않음",
      "스키마 검증, 출력 예산, 타임아웃, 호출 제한, 감사 로그 및 트레이싱 지원",
    ],
    finalTitle: "한 번만 연결하면, 이미 쓰고 있는 클라이언트에서 바로 질문할 수 있습니다.",
    finalText:
      "하나의 엔드포인트로 지원하는 모든 MCP 클라이언트에서 동작합니다. 건강 데이터 접근은 선택 사항이며 계정 설정에서 전체 연결과 함께 언제든 철회할 수 있습니다.",
  },
  de: {
    title: "Deine KI kann dein Training lesen. Und du siehst genau, wie.",
    description:
      "Verbinde TrainingLoad über einen schreibgeschützten, OAuth-geschützten MCP-Server mit deinem KI-Client. Stelle echte Trainingsfragen, prüfe jeden Tool-Aufruf und verifiziere jede Aussage anhand der zurückgegebenen Daten.",
    eyebrow: "TrainingLoad MCP",
    connect: "MCP verbinden",
    docs: "Dokumentation lesen",
    supported: "Funktioniert mit",
    contractEyebrow: "Eine durchdachte Produktoberfläche, keine rohe API",
    contractTitle: "24 klar begrenzte Tools. Drei Ressourcen. Drei wiederverwendbare Prompts.",
    contractText:
      "Der Server liefert bevorzugt einen kompakten Überblick und ruft feinere Details nur ab, wenn die Frage sie wirklich erfordert. Jede Liste besitzt ein Zeitfenster, ein Limit und einen opaken Cursor.",
    groups: [
      ["Aktueller Stand", "Snapshot, Readiness-Signale und Trainingsbelastungs-Zeitreihen"],
      [
        "Fortschritt",
        "Periodenvergleich, Sportarten-Aufschlüsselung, Aktivitätsstatistiken, Konstanz, Fitness, Zonen und Bestzeiten",
      ],
      [
        "Umsetzung",
        "Aktivitätszonen und Splits, Planzusammenfassungen, Planeinhaltung und Wettkampfdetails",
      ],
      ["Verbindungen", "Sync-Status plus optionaler Gesundheitskontext"],
    ],
    workflowEyebrow: "Von der Verbindung zum Beleg",
    workflowTitle: "Eine URL hinzufügen, gewünschte Daten freigeben und einfach fragen.",
    workflowText:
      "Der Client erkennt OAuth und Tools automatisch vom Server. TrainingLoad wahrt Autorisierung und Datengrenzen serverseitig, während jede Antwort im Chat vollständig nachvollziehbar bleibt.",
    workflow: [
      [
        "01",
        "Server hinzufügen",
        "Nutze dieselbe Remote-URL in jedem unterstützten Client.",
      ],
      [
        "02",
        "Freigabe prüfen",
        "Lese-Scopes bestätigen; Gesundheitsdaten bleiben separat.",
      ],
      [
        "03",
        "Echte Frage stellen",
        "Der Client wählt den kleinstmöglichen sinnvollen Tool-Pfad.",
      ],
      [
        "04",
        "Antwort verifizieren",
        "Aufrufe, Zeiträume, zurückgegebene Fakten und Datenlücken prüfen.",
      ],
    ],
    recipes: "Native Prompts, Ressourcen und Tool-Pfade ansehen",
    safetyTitle: "Privat by Design",
    safetyText:
      "OAuth-Scopes werden beim Auflisten der Tools und erneut bei jeder Ausführung geprüft. Ergebnisse enthalten keine direkten Identitätsfelder, Roh-Sensorstreams, präzisen Routen, Zugangsdaten oder vollständigen FIT-Dateien.",
    safety: [
      "Reine Lese-Tools; kein versteckter Schreibpfad",
      "Nur aktueller Athlet; opake IDs sind streng nutzergebunden",
      "Nicht vertrauenswürdige Notizen werden bereinigt und niemals als Anweisung interpretiert",
      "Schema-Validierung, Output-Budgets, Timeouts, Limits, Audit-Logs und Traces",
    ],
    finalTitle: "Einmal verbinden. Direkt in dem Client fragen, den du bereits nutzt.",
    finalText:
      "Derselbe Endpunkt funktioniert mit allen unterstützten MCP-Clients. Der Zugriff auf Gesundheitsdaten bleibt optional und lässt sich zusammen mit der Verbindung jederzeit im Konto widerrufen.",
  },
  fr: {
    title: "Votre IA peut lire votre entraînement. Et vous voyez exactement comment.",
    description:
      "Connectez TrainingLoad à votre client IA via un serveur MCP en lecture seule protégé par OAuth. Posez une vraie question d'entraînement, inspectez chaque appel d'outil et vérifiez la conclusion sur les données renvoyées.",
    eyebrow: "TrainingLoad MCP",
    connect: "Connecter MCP",
    docs: "Lire la documentation",
    supported: "Compatible avec",
    contractEyebrow: "Une vraie surface produit, pas une API brute",
    contractTitle: "24 outils bornés. Trois ressources. Trois prompts réutilisables.",
    contractText:
      "Le serveur privilégie un instantané agrégé et n'expose un niveau de détail plus fin que si la question l'exige. Chaque liste comporte une borne temporelle, une limite et un curseur opaque.",
    groups: [
      ["État actuel", "Instantané, indicateurs de fraîcheur et séries de charge d'entraînement"],
      [
        "Progression",
        "Comparaison de périodes, répartition par sport, statistiques d'activités, régularité, forme physique, zones et records",
      ],
      [
        "Exécution",
        "Zones et temps de passage, résumés de plan, adhérence et détails de compétition",
      ],
      ["Connexions", "État de synchronisation et contexte santé optionnel"],
    ],
    workflowEyebrow: "De la connexion à la preuve",
    workflowTitle: "Ajoutez une URL, approuvez les données voulues, puis posez vos questions normalement.",
    workflowText:
      "Le client découvre OAuth et les outils depuis le serveur. TrainingLoad maintient les autorisations et les limites de données côté serveur, tandis que chaque réponse reste vérifiable dans la conversation.",
    workflow: [
      [
        "01",
        "Ajouter le serveur",
        "Utilisez la même URL distante dans n'importe quel client compatible.",
      ],
      [
        "02",
        "Vérifier les permissions",
        "Approuvez les scopes en lecture ; les données de santé restent séparées.",
      ],
      [
        "03",
        "Poser une vraie question",
        "Le client choisit le plus petit chemin d'outils pertinent.",
      ],
      [
        "04",
        "Vérifier la réponse",
        "Inspectez les appels, périodes, faits renvoyés et données manquantes.",
      ],
    ],
    recipes: "Voir les prompts natifs, ressources et chemins d'outils",
    safetyTitle: "Confidentiel par conception",
    safetyText:
      "Les scopes OAuth sont vérifiés lors du listage des outils puis de nouveau à l'exécution. Les résultats excluent les champs d'identité directe, flux de capteurs bruts, traces GPS précises, identifiants et fichiers FIT complets.",
    safety: [
      "Outils en lecture seule ; aucun chemin d'écriture caché",
      "Athlète courant uniquement ; identifiants opaques cloisonnés par utilisateur",
      "Les notes non fiables sont assainies et jamais traitées comme des instructions",
      "Validation de schéma, budgets de sortie, timeouts, limites, audit et traces",
    ],
    finalTitle: "Connectez une seule fois. Interrogez depuis le client que vous utilisez déjà.",
    finalText:
      "Le même point d'accès fonctionne avec tous les clients MCP compatibles. L'accès aux données de santé reste facultatif et peut être révoqué avec l'ensemble de la connexion depuis votre compte.",
  },
  es: {
    title: "Tu IA puede leer tu entrenamiento. Y tú ves exactamente cómo.",
    description:
      "Conecta TrainingLoad a tu cliente de IA mediante un servidor MCP de solo lectura protegido con OAuth. Haz una pregunta real sobre tu entrenamiento, inspecciona cada llamada de herramienta y verifica la conclusión con los datos devueltos.",
    eyebrow: "TrainingLoad MCP",
    connect: "Conectar MCP",
    docs: "Leer la documentación",
    supported: "Funciona con",
    contractEyebrow: "Una superficie de producto, no una API sin procesar",
    contractTitle: "24 herramientas acotadas. Tres recursos. Tres prompts reutilizables.",
    contractText:
      "El servidor prioriza una instantánea agregada y solo expone mayor detalle cuando la pregunta lo requiere. Cada lista tiene ventana temporal, límite y un cursor opaco.",
    groups: [
      ["Estado actual", "Instantánea, indicadores de preparación y series de carga de entrenamiento"],
      [
        "Progreso",
        "Comparación de períodos, desglose por deporte, estadísticas de actividad, constancia, estado físico, zonas y marcas personales",
      ],
      [
        "Ejecución",
        "Zonas y parciales de actividad, resúmenes de plan, cumplimiento y detalles de competición",
      ],
      ["Conexiones", "Estado de sincronización más contexto de salud opcional"],
    ],
    workflowEyebrow: "De la conexión a la evidencia",
    workflowTitle: "Añade una URL, aprueba los datos que quieras y pregunta con normalidad.",
    workflowText:
      "El cliente descubre OAuth y las herramientas directamente desde el servidor. TrainingLoad mantiene la autorización y los límites de datos en el servidor, mientras cada respuesta sigue siendo auditable en la conversación.",
    workflow: [
      [
        "01",
        "Añade el servidor",
        "Usa la misma URL remota en cualquier cliente compatible.",
      ],
      [
        "02",
        "Revisa el consentimiento",
        "Aprueba scopes de solo lectura; los datos de salud van por separado.",
      ],
      [
        "03",
        "Haz una pregunta real",
        "El cliente elige la ruta mínima de herramientas necesaria.",
      ],
      [
        "04",
        "Verifica la respuesta",
        "Inspecciona llamadas, rangos de fechas, hechos devueltos y datos faltantes.",
      ],
    ],
    recipes: "Ver prompts nativos, recursos y rutas de herramientas",
    safetyTitle: "Privado por diseño",
    safetyText:
      "Los scopes OAuth se comprueban al listar las herramientas y nuevamente al ejecutarlas. Los resultados excluyen campos de identidad directa, flujos brutos de sensores, rutas precisas, credenciales y archivos FIT completos.",
    safety: [
      "Herramientas de solo lectura; sin rutas de escritura ocultas",
      "Solo el deportista actual; los ID opacos están aislados por usuario",
      "Las notas no confiables se sanean y nunca se tratan como instrucciones",
      "Validación de esquemas, presupuestos de salida, timeouts, límites, auditoría y trazas",
    ],
    finalTitle: "Conéctalo una vez. Pregunta desde el cliente que ya utilizas.",
    finalText:
      "El mismo endpoint funciona en todos los clientes MCP compatibles. El acceso a datos de salud es opcional y se puede revocar junto con toda la conexión desde tu cuenta.",
  },
  it: {
    title: "La tua AI può leggere il tuo allenamento. E tu vedi esattamente come.",
    description:
      "Collega TrainingLoad al tuo client AI tramite un server MCP in sola lettura protetto da OAuth. Fai una domanda reale sul tuo allenamento, ispeziona ogni chiamata agli strumenti e verifica la conclusione sui dati restituiti.",
    eyebrow: "TrainingLoad MCP",
    connect: "Collega MCP",
    docs: "Leggi la documentazione",
    supported: "Compatibile con",
    contractEyebrow: "Una vera interfaccia di prodotto, non un'API grezza",
    contractTitle: "24 strumenti con limiti precisi. Tre risorse. Tre prompt riutilizzabili.",
    contractText:
      "Il server privilegia uno snapshot aggregato ed espone dettagli più granulari solo quando la domanda lo richiede. Ogni elenco ha una finestra temporale, un limite e un cursore opaco.",
    groups: [
      ["Stato attuale", "Snapshot, indicatori di prontezza e serie del carico di allenamento"],
      [
        "Progressi",
        "Confronto tra periodi, suddivisione per sport, statistiche attività, costanza, forma fisica, zone e primati personali",
      ],
      [
        "Esecuzione",
        "Zone e parziali delle attività, riepiloghi del piano, aderenza e dettagli gara",
      ],
      ["Connessioni", "Stato di sincronizzazione e contesto salute opzionale"],
    ],
    workflowEyebrow: "Dalla connessione alle prove",
    workflowTitle: "Aggiungi un solo URL, approva i dati che preferisci e chiedi normalmente.",
    workflowText:
      "Il client rileva OAuth e strumenti direttamente dal server. TrainingLoad gestisce autorizzazioni e confini dei dati lato server, mentre ogni risposta resta ispezionabile nella conversazione.",
    workflow: [
      [
        "01",
        "Aggiungi il server",
        "Usa lo stesso URL remoto in qualsiasi client supportato.",
      ],
      [
        "02",
        "Controlla il consenso",
        "Approva gli scope in lettura; i dati salute restano separati.",
      ],
      [
        "03",
        "Fai una domanda reale",
        "Il client seleziona il percorso minimo di strumenti utile.",
      ],
      [
        "04",
        "Verifica la risposta",
        "Esamina chiamate, intervalli, fatti restituiti e dati mancanti.",
      ],
    ],
    recipes: "Scopri prompt nativi, risorse e percorsi degli strumenti",
    safetyTitle: "Privato fin dalla progettazione",
    safetyText:
      "Gli scope OAuth vengono verificati all'elenco degli strumenti e di nuovo in fase di esecuzione. I risultati escludono campi di identità diretta, flussi grezzi dei sensori, percorsi GPS precisi, credenziali e dati FIT completi.",
    safety: [
      "Strumenti in sola lettura; nessun percorso di scrittura nascosto",
      "Solo l'atleta corrente; gli ID opachi sono vincolati all'utente",
      "Le note non attendibili vengono sanificate e mai trattate come istruzioni",
      "Validazione dello schema, budget di output, timeout, limiti, audit e tracce",
    ],
    finalTitle: "Collegalo una volta. Fai domande nel client che usi già.",
    finalText:
      "Lo stesso endpoint funziona su tutti i client MCP supportati. L'accesso ai dati salute resta opzionale e può essere revocato insieme all'intera connessione dal tuo account.",
  },
  "pt-BR": {
    title: "Sua IA pode ler seu treino. E você vê exatamente como.",
    description:
      "Conecte o TrainingLoad ao seu cliente de IA por meio de um servidor MCP somente leitura protegido por OAuth. Faça uma pergunta real sobre seu treino, inspecione cada chamada de ferramenta e valide a conclusão nos dados retornados.",
    eyebrow: "TrainingLoad MCP",
    connect: "Conectar MCP",
    docs: "Ler a documentação",
    supported: "Funciona com",
    contractEyebrow: "Uma superfície de produto, não uma API bruta",
    contractTitle: "24 ferramentas delimitadas. Três recursos. Três prompts reutilizáveis.",
    contractText:
      "O servidor prioriza um panorama agregado e só expõe detalhes mais granulares quando a pergunta realmente exige. Toda lista tem janela de tempo, limite e cursor opaco.",
    groups: [
      ["Estado atual", "Panorama do treino, indicadores de prontidão e séries de carga de treino"],
      [
        "Evolução",
        "Comparação de períodos, divisão por esporte, estatísticas de atividade, consistência, condicionamento, zonas e recordes pessoais",
      ],
      [
        "Execução",
        "Zonas e parciais das atividades, resumos do plano, aderência e detalhes de provas",
      ],
      ["Conexões", "Status de sincronização e contexto de saúde opcional"],
    ],
    workflowEyebrow: "Da conexão à evidência",
    workflowTitle: "Adicione uma URL, aprove os dados desejados e pergunte normalmente.",
    workflowText:
      "O cliente descobre o OAuth e as ferramentas direto no servidor. O TrainingLoad mantém autorização e limites de dados no servidor, enquanto cada resposta continua auditável na conversa.",
    workflow: [
      [
        "01",
        "Adicione o servidor",
        "Use a mesma URL remota em qualquer cliente compatível.",
      ],
      [
        "02",
        "Revise o consentimento",
        "Aprove escopos somente leitura; dados de saúde ficam separados.",
      ],
      [
        "03",
        "Faça uma pergunta real",
        "O cliente escolhe o menor caminho útil de ferramentas.",
      ],
      [
        "04",
        "Verifique a resposta",
        "Inspecione chamadas, períodos, fatos retornados e dados ausentes.",
      ],
    ],
    recipes: "Ver prompts nativos, recursos e caminhos de ferramentas",
    safetyTitle: "Privacidade por construção",
    safetyText:
      "Os escopos OAuth são verificados ao listar as ferramentas e novamente durante a execução. Os resultados excluem campos de identidade direta, fluxos brutos de sensores, rotas precisas, credenciais e arquivos FIT completos.",
    safety: [
      "Ferramentas somente leitura; nenhum caminho oculto de escrita",
      "Apenas o atleta atual; IDs opacos são isolados por usuário",
      "Notas não confiáveis são higienizadas e nunca tratadas como instruções",
      "Validação de esquema, orçamento de saída, timeouts, limites, auditoria e rastreamento",
    ],
    finalTitle: "Conecte uma vez. Pergunte no cliente que você já usa.",
    finalText:
      "O mesmo endpoint funciona em todos os clientes MCP compatíveis. O acesso aos dados de saúde continua opcional e pode ser revogado junto com toda a conexão na sua conta.",
  },
};

function getMcpCopy(lang: string): McpFeatureCopy {
  return copy[lang as McpFeatureLocale] ?? copy.en;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const localized = getMcpCopy(lang);
  return {
    title: `TrainingLoad MCP | ${localized.title}`,
    description: localized.description,
    alternates: {
      canonical: `${siteUrl()}${prefix}/features/mcp`,
      languages: absoluteAlternatesForPath(siteUrl(), "/features/mcp"),
    },
    openGraph: {
      title: `TrainingLoad MCP | ${localized.title}`,
      description: localized.description,
      type: "website",
      url: `${siteUrl()}${prefix}/features/mcp`,
    },
  };
}

export default async function McpFeaturePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const t = getMcpCopy(lang);

  return (
    <div className="bg-neutral-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto grid min-h-[680px] max-w-[1440px] lg:grid-cols-[0.42fr_0.58fr]">
          <div className="flex flex-col justify-center border-white/10 px-5 py-12 md:py-16 sm:px-10 lg:border-r lg:px-14 xl:px-20">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              {t.eyebrow}
            </div>
            <h1 className="mt-6 max-w-xl text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl xl:text-6xl">
              {t.title}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-neutral-400 sm:text-lg">
              {t.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`${prefix}/docs/mcp/connect`}
                className="inline-flex h-11 items-center gap-2 rounded-compact bg-emerald-400 px-5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
              >
                {t.connect}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href={`${prefix}/docs/mcp`}
                className="inline-flex h-11 items-center gap-2 rounded-compact border border-white/15 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                {t.docs}
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-12 border-t border-white/10 pt-6">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                {t.supported}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {clients.map((client) => (
                  <span
                    key={client}
                    className="rounded-compact border border-white/10 px-2.5 py-1 font-mono text-xs text-neutral-300"
                  >
                    {client}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div
            className="flex items-center px-4 py-12 sm:px-8 lg:px-12"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.09) 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          >
            <McpTerminalDemo
              copy={getMcpTerminalCopy(lang)}
              href={`${prefix}/docs/mcp/connect`}
              className="mx-auto w-full max-w-3xl"
            />
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 px-5 py-12 md:py-16 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.42fr_0.58fr] lg:gap-16">
            <div>
              <div className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                {t.workflowEyebrow}
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
                {t.workflowTitle}
              </h2>
              <p className="mt-5 text-base leading-7 text-neutral-400">
                {t.workflowText}
              </p>
              <Link
                href={`${prefix}/docs/mcp/use-cases`}
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
              >
                {t.recipes}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="border-l border-t border-white/10 sm:grid sm:grid-cols-2">
              {t.workflow.map(([number, title, detail]) => (
                <article
                  key={number}
                  className="min-h-48 border-b border-r border-white/10 p-6"
                >
                  <div className="font-mono text-xs text-emerald-400">
                    {number}
                  </div>
                  <h3 className="mt-7 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">
                    {detail}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 px-5 py-12 md:py-16 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              {t.contractEyebrow}
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
              {t.contractTitle}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-400">
              {t.contractText}
            </p>
          </div>
          <div className="mt-12 grid border-l border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {t.groups.map(([title, detail], index) => (
              <article
                key={title}
                className="min-h-44 border-b border-r border-white/10 p-6"
              >
                <div className="font-mono text-xs text-emerald-400">
                  0{index + 1}
                </div>
                <h3 className="mt-6 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  {detail}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 px-5 py-12 md:py-16 sm:px-10">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.42fr_0.58fr] lg:gap-16">
          <div>
            <LockKeyhole
              className="size-7 text-emerald-400"
              aria-hidden="true"
            />
            <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">
              {t.safetyTitle}
            </h2>
            <p className="mt-5 text-base leading-7 text-neutral-400">
              {t.safetyText}
            </p>
          </div>
          <div className="border-t border-white/10">
            {t.safety.map((item) => (
              <div
                key={item}
                className="flex gap-4 border-b border-white/10 py-5 text-sm leading-6 text-neutral-200"
              >
                <Check
                  className="mt-0.5 size-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                {item}
              </div>
            ))}
            <Link
              href={`${prefix}/docs/mcp/security`}
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
            >
              {t.docs}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 md:py-16 sm:px-10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 border border-white/10 bg-white/[0.025] p-7 sm:p-10 lg:flex-row lg:items-center">
          <div className="max-w-3xl">
            <TerminalSquare
              className="size-6 text-emerald-400"
              aria-hidden="true"
            />
            <h2 className="mt-5 text-2xl font-black tracking-tight sm:text-4xl">
              {t.finalTitle}
            </h2>
            <p className="mt-4 text-sm leading-6 text-neutral-400 sm:text-base">
              {t.finalText}
            </p>
          </div>
          <Link
            href={`${prefix}/docs/mcp/connect`}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-compact bg-emerald-400 px-5 text-sm font-semibold text-neutral-950 hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
          >
            {t.connect}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
