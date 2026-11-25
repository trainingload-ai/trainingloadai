export type McpTerminalScenario = {
  question: string;
  calls: readonly (readonly [name: string, detail: string])[];
  answer: string;
};

export type McpTerminalCopy = {
  demoLabel: string;
  connectedLabel: string;
  scenarios: readonly [McpTerminalScenario, ...McpTerminalScenario[]];
  accessibleSummary: string;
};

type SupportedMcpLocale =
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

const MCP_TERMINAL_COPY = {
  en: {
    demoLabel: "demo",
    connectedLabel: "connected",
    scenarios: [
      {
        question: "Why does this week feel harder than last week?",
        calls: [
          [
            "get_training_snapshot",
            "Current load, form, recent sessions, next workouts",
          ],
          ["compare_training_periods", "Compare this week with last week"],
          ["list_planned_workouts", "Check what is still scheduled"],
        ],
        answer:
          "Your 7-day load is 468 versus 397 last week (+18%), while form moved from +4 to −9. Two harder sessions landed within 48 hours, and tomorrow still contains 6 × 3 minute intervals. The higher recent load plus compressed recovery explains the heavier feeling; the data does not establish a medical cause.",
      },
      {
        question: "My race is four weeks away. Should I adjust the plan?",
        calls: [
          ["list_competitions", "Find the next race and target date"],
          ["get_plan_adherence", "Review four weeks of planned execution"],
          ["get_training_readiness", "Check current load and form signals"],
        ],
        answer:
          "Race day is 28 days away. You completed 16 of 18 planned sessions (89%); current form is −5 and 7-day load remains inside your recent range. The data does not support a large plan change now. Keep the recovery day, then review again after the weekend key session. This is not a medical or safe-to-race decision.",
      },
      {
        question: "Has my running fitness actually improved?",
        calls: [
          ["get_fitness_trends", "Read the 12-week running fitness trend"],
          ["get_activity_statistics", "Compare pace, duration, and volume"],
          ["get_personal_bests", "Check recent running bests"],
        ],
        answer:
          "Running effective VO₂max rose from 49.2 to 51.0 over 12 weeks, while pace in the same heart-rate band improved from 4:58/km to 4:46/km. Your 5 km best is unchanged. That supports better aerobic efficiency, but not yet a new 5 km race-performance claim.",
      },
    ],
    accessibleSummary:
      "Three animated MCP examples rotate through week-over-week fatigue, race preparation, and running fitness. Each example shows the real Trainingload.ai tools used before a plain-text answer.",
  },
  zh: {
    demoLabel: "示例",
    connectedLabel: "已连接",
    scenarios: [
      {
        question: "为什么这周感觉比上周累？",
        calls: [
          ["get_training_snapshot", "获取当前负荷、状态、近期训练与接下来课程"],
          ["compare_training_periods", "比较本周与上周"],
          ["list_planned_workouts", "检查仍待执行的计划"],
        ],
        answer:
          "你最近 7 天负荷为 468，上周为 397（+18%），同时状态从 +4 降到 −9。两次高负荷训练间隔不足 48 小时，明天仍有 6 × 3 分钟间歇。近期负荷升高和恢复被压缩可以解释更累的感觉，但这些数据不能证明医疗原因。",
      },
      {
        question: "距离比赛还有 4 周，需要调整计划吗？",
        calls: [
          ["list_competitions", "找到下一场比赛和目标日期"],
          ["get_plan_adherence", "检查近 4 周计划执行情况"],
          ["get_training_readiness", "查看当前负荷与状态信号"],
        ],
        answer:
          "比赛还有 28 天。最近 4 周完成了 18 节计划中的 16 节（89%）；当前状态为 −5，7 天负荷仍在近期常见区间。现有数据不支持立刻大幅改计划，先保留恢复日，周末关键课后再复核。这不是医疗判断或安全参赛结论。",
      },
      {
        question: "最近跑步能力真的进步了吗？",
        calls: [
          ["get_fitness_trends", "读取近 12 周跑步体能趋势"],
          ["get_activity_statistics", "比较配速、时长与训练量"],
          ["get_personal_bests", "核对近期跑步最佳成绩"],
        ],
        answer:
          "近 12 周跑步有效 VO₂max 从 49.2 升到 51.0，同一心率区间的配速从 4:58/km 提升到 4:46/km；5 km 最佳成绩没有变化。这支持有氧效率正在改善，但还不能断言 5 km 比赛能力已经刷新。",
      },
    ],
    accessibleSummary:
      "三个 MCP 动画示例依次展示周间疲劳、赛前准备和跑步能力变化。每个示例都会先显示真实使用的 Trainingload.ai 工具，再返回纯文本结论。",
  },
  "zh-hant": {
    demoLabel: "範例",
    connectedLabel: "已連線",
    scenarios: [
      {
        question: "為什麼這週感覺比上週累？",
        calls: [
          ["get_training_snapshot", "取得目前負荷、狀態、近期訓練與後續課表"],
          ["compare_training_periods", "比較本週與上週"],
          ["list_planned_workouts", "查看尚待執行的計畫"],
        ],
        answer:
          "你最近 7 天負荷為 468，上週為 397（+18%），同時狀態從 +4 降到 −9。兩次高負荷訓練間隔不到 48 小時，明天仍有 6 × 3 分鐘間歇。近期負荷升高與恢復時間被壓縮可解釋較累的感覺，但這些資料無法證明醫療原因。",
      },
      {
        question: "距離比賽還有 4 週，需要調整計畫嗎？",
        calls: [
          ["list_competitions", "找出下一場比賽與目標日期"],
          ["get_plan_adherence", "檢視近 4 週計畫執行狀況"],
          ["get_training_readiness", "查看目前負荷與狀態訊號"],
        ],
        answer:
          "距離比賽還有 28 天。最近 4 週完成了 18 次計畫中的 16 次（89%）；目前狀態為 −5，7 天負荷仍在近期常見區間。現有資料不支持立刻大幅修改計畫，先保留恢復日，週末關鍵課表後再檢視。這並非醫療判斷或安全參賽結論。",
      },
      {
        question: "最近跑步能力真的進步了嗎？",
        calls: [
          ["get_fitness_trends", "讀取近 12 週跑步體能趨勢"],
          ["get_activity_statistics", "比較配速、時長與訓練量"],
          ["get_personal_bests", "核對近期跑步最佳成績"],
        ],
        answer:
          "近 12 週跑步有效 VO₂max 從 49.2 升至 51.0，相同心率區間的配速從 4:58/km 進步到 4:46/km；5 km 最佳成績尚未改變。這顯示有氧效率正在提升，但還不足以斷言 5 km 比賽表現已經刷新。",
      },
    ],
    accessibleSummary:
      "三個 MCP 動畫範例依序展示週間疲勞、賽前準備與跑步能力變化。每個範例皆先顯示實際呼叫的 Trainingload.ai 工具，再回傳純文字結論。",
  },
  ja: {
    demoLabel: "デモ",
    connectedLabel: "接続済み",
    scenarios: [
      {
        question: "なぜ今週は先週よりきつく感じるのですか？",
        calls: [
          [
            "get_training_snapshot",
            "現在の負荷、コンディション、最近の練習、次のメニューを取得",
          ],
          ["compare_training_periods", "今週と先週を比較"],
          ["list_planned_workouts", "残っている予定メニューを確認"],
        ],
        answer:
          "直近7日間の負荷は468で、先週の397から+18%増加し、コンディションは+4から−9に低下しています。高負荷セッションが48時間以内に2回入り、明日も3分×6本のインターバルが予定されています。負荷上昇と回復不足が重だるさの説明になりますが、医学的な原因を示すものではありません。",
      },
      {
        question: "レースまであと4週間です。プランを調整すべきですか？",
        calls: [
          ["list_competitions", "次のレースと開催日を確認"],
          ["get_plan_adherence", "直近4週間の計画達成状況を確認"],
          ["get_training_readiness", "現在の負荷とコンディション指標を確認"],
        ],
        answer:
          "レースまで残り28日です。直近4週間で予定18本のうち16本を完了（89%）、現在のコンディションは−5で、7日間負荷も最近の通常範囲内です。今すぐ大きく変更する根拠はありません。休養日を維持し、週末のキー練習後に再確認してください。医療判断や出場可否の判断ではありません。",
      },
      {
        question: "ランニングの走力は本当に上がっていますか？",
        calls: [
          ["get_fitness_trends", "直近12週間の走力トレンドを取得"],
          ["get_activity_statistics", "ペース、時間、練習量を比較"],
          ["get_personal_bests", "最近の自己ベストを確認"],
        ],
        answer:
          "12週間で実効 VO₂max は49.2から51.0へ上昇し、同じ心拍ゾーンでのペースも4:58/kmから4:46/kmへ改善しています。一方で5 kmベストは未更新です。有酸素効率の改善は裏付けられますが、5 kmのレース記録更新を断定できる段階ではありません。",
      },
    ],
    accessibleSummary:
      "週ごとの疲労、レース前の調整、走力の推移という3つのMCPアニメーション例を順に表示します。各例では、実際に使用したTrainingload.aiツールを表示してからテキスト回答を示します。",
  },
  ko: {
    demoLabel: "데모",
    connectedLabel: "연결됨",
    scenarios: [
      {
        question: "왜 이번 주가 지난주보다 더 힘들게 느껴지나요?",
        calls: [
          [
            "get_training_snapshot",
            "현재 부하, 컨디션, 최근 훈련, 예정 세션 확인",
          ],
          ["compare_training_periods", "이번 주와 지난주 비교"],
          ["list_planned_workouts", "남아 있는 예정 훈련 확인"],
        ],
        answer:
          "최근 7일 부하는 468로 지난주 397보다 18% 늘었고, 폼은 +4에서 −9로 내려갔습니다. 48시간 안에 고강도 세션이 두 번 겹쳤고 내일도 3분 × 6회 인터벌이 남아 있습니다. 높아진 부하와 짧은 회복이 무거운 느낌을 설명하지만, 의학적 원인을 단정하지는 않습니다.",
      },
      {
        question: "대회가 4주 남았습니다. 계획을 조정해야 할까요?",
        calls: [
          ["list_competitions", "다음 대회와 목표 날짜 찾기"],
          ["get_plan_adherence", "최근 4주 계획 이행률 확인"],
          ["get_training_readiness", "현재 부하와 컨디션 신호 확인"],
        ],
        answer:
          "대회까지 28일 남았습니다. 최근 4주간 예정된 18개 세션 중 16개(89%)를 완료했고 현재 폼은 −5이며 7일 부하도 최근 범위 안에 있습니다. 지금 계획을 크게 바꿀 근거는 부족합니다. 회복일을 유지한 뒤 주말 핵심 훈련 후 다시 점검하세요. 이는 의학적 판단이나 안전한 출전 여부에 대한 결정이 아닙니다.",
      },
      {
        question: "내 러닝 체력이 실제로 좋아졌나요?",
        calls: [
          ["get_fitness_trends", "12주 러닝 체력 추세 읽기"],
          ["get_activity_statistics", "페이스, 시간, 훈련량 비교"],
          ["get_personal_bests", "최근 러닝 최고 기록 확인"],
        ],
        answer:
          "12주 동안 유효 VO₂max가 49.2에서 51.0으로 올랐고, 같은 심박 구간에서의 페이스도 4:58/km에서 4:46/km로 빨라졌습니다. 5 km 최고 기록은 변동이 없습니다. 유산소 효율 개선은 확인되지만 아직 새로운 5 km 레이스 기록을 단정하기는 이릅니다.",
      },
    ],
    accessibleSummary:
      "주간 피로, 대회 준비, 러닝 체력 변화를 다루는 3개의 MCP 애니메이션 예시가 순환합니다. 각 예시는 실제 사용된 Trainingload.ai 도구를 먼저 보여준 뒤 텍스트 답변을 제공합니다.",
  },
  de: {
    demoLabel: "Demo",
    connectedLabel: "verbunden",
    scenarios: [
      {
        question: "Warum fühlt sich diese Woche schwerer an als letzte Woche?",
        calls: [
          [
            "get_training_snapshot",
            "Aktuelle Belastung, Form, letzte Einheiten, nächste Termine",
          ],
          [
            "compare_training_periods",
            "Diese Woche mit letzter Woche vergleichen",
          ],
          ["list_planned_workouts", "Prüfen, was noch geplant ist"],
        ],
        answer:
          "Deine 7-Tage-Belastung liegt bei 468 statt 397 in der Vorwoche (+18 %), während die Form von +4 auf −9 gefallen ist. Zwei harte Einheiten lagen innerhalb von 48 Stunden, und morgen stehen noch 6 × 3-Minuten-Intervalle an. Die höhere Belastung und knappe Erholung erklären das schwere Gefühl; eine medizinische Ursache belegen die Daten nicht.",
      },
      {
        question:
          "Mein Wettkampf ist in vier Wochen. Sollte ich den Plan anpassen?",
        calls: [
          ["list_competitions", "Nächsten Wettkampf und Zieldatum finden"],
          ["get_plan_adherence", "Planumsetzung der letzten vier Wochen prüfen"],
          [
            "get_training_readiness",
            "Aktuelle Belastungs- und Formsignale prüfen",
          ],
        ],
        answer:
          "Bis zum Wettkampf sind es noch 28 Tage. Du hast 16 von 18 geplanten Einheiten absolviert (89 %); deine Form liegt bei −5 und die 7-Tage-Belastung im gewohnten Bereich. Die Daten sprechen derzeit nicht für eine große Planänderung. Behalte den Ruhetag bei und prüfe nach der Schlüsseleinheit am Wochenende erneut. Das ist keine medizinische Einschätzung oder Startfreigabe.",
      },
      {
        question: "Hat sich meine Lauffitness wirklich verbessert?",
        calls: [
          ["get_fitness_trends", "12-Wochen-Trend der Lauffitness lesen"],
          [
            "get_activity_statistics",
            "Pace, Dauer und Umfang vergleichen",
          ],
          ["get_personal_bests", "Aktuelle Lauf-Bestleistungen prüfen"],
        ],
        answer:
          "Dein effektiver Lauf-VO₂max stieg in 12 Wochen von 49,2 auf 51,0, und die Pace im selben Herzfrequenzbereich verbesserte sich von 4:58/km auf 4:46/km. Deine 5-km-Bestzeit ist unverändert. Das spricht für bessere aerobe Effizienz, aber noch nicht für eine neue 5-km-Wettkampfleistung.",
      },
    ],
    accessibleSummary:
      "Drei animierte MCP-Beispiele wechseln zwischen Wochenermüdung, Wettkampfvorbereitung und Lauffitness. Jedes Beispiel zeigt zuerst die tatsächlich genutzten Trainingload.ai-Tools und danach eine Textantwort.",
  },
  fr: {
    demoLabel: "démo",
    connectedLabel: "connecté",
    scenarios: [
      {
        question:
          "Pourquoi cette semaine paraît-elle plus dure que la semaine dernière ?",
        calls: [
          [
            "get_training_snapshot",
            "Charge actuelle, fraîcheur, séances récentes et à venir",
          ],
          [
            "compare_training_periods",
            "Comparer cette semaine à la semaine précédente",
          ],
          ["list_planned_workouts", "Vérifier ce qui reste au programme"],
        ],
        answer:
          "Votre charge sur 7 jours est de 468 contre 397 la semaine passée (+18 %), tandis que la fraîcheur est passée de +4 à −9. Deux séances exigeantes ont eu lieu en moins de 48 heures et demain prévoit encore 6 × 3 minutes d’intervalles. Cette hausse de charge et une récupération réduite expliquent la lourdeur ressentie ; les données n’établissent pas de cause médicale.",
      },
      {
        question: "Ma course est dans quatre semaines. Faut-il ajuster le plan ?",
        calls: [
          ["list_competitions", "Trouver la prochaine course et sa date"],
          [
            "get_plan_adherence",
            "Examiner l’exécution du plan sur quatre semaines",
          ],
          [
            "get_training_readiness",
            "Vérifier les signaux de charge et de fraîcheur",
          ],
        ],
        answer:
          "La course est dans 28 jours. Vous avez réalisé 16 des 18 séances prévues (89 %) ; votre fraîcheur est à −5 et la charge sur 7 jours reste dans votre plage habituelle. Les données ne justifient pas un grand changement maintenant. Gardez la journée de récupération puis réévaluez après la séance clé du week-end. Ce n’est ni un avis médical ni un feu vert pour courir.",
      },
      {
        question: "Ma forme en course à pied a-t-elle vraiment progressé ?",
        calls: [
          [
            "get_fitness_trends",
            "Lire la tendance de forme en course sur 12 semaines",
          ],
          ["get_activity_statistics", "Comparer allure, durée et volume"],
          ["get_personal_bests", "Vérifier les records récents en course"],
        ],
        answer:
          "Votre VO₂max effective en course est passée de 49,2 à 51,0 sur 12 semaines, et votre allure dans la même zone cardiaque s’est améliorée de 4:58/km à 4:46/km. Votre record sur 5 km reste inchangé. Cela confirme une meilleure efficacité aérobie, sans encore prouver un nouveau chrono en course sur 5 km.",
      },
    ],
    accessibleSummary:
      "Trois exemples MCP animés alternent entre fatigue hebdomadaire, préparation de course et progression en course à pied. Chaque exemple affiche les vrais outils Trainingload.ai appelés avant une réponse en texte clair.",
  },
  es: {
    demoLabel: "demo",
    connectedLabel: "conectado",
    scenarios: [
      {
        question: "¿Por qué esta semana se siente más dura que la pasada?",
        calls: [
          [
            "get_training_snapshot",
            "Carga actual, forma, sesiones recientes y próximas",
          ],
          ["compare_training_periods", "Comparar esta semana con la anterior"],
          ["list_planned_workouts", "Revisar lo que sigue programado"],
        ],
        answer:
          "Tu carga de 7 días es 468 frente a 397 la semana pasada (+18 %), mientras tu forma bajó de +4 a −9. Hubo dos sesiones exigentes en 48 horas y mañana siguen programadas 6 × 3 minutos de intervalos. La mayor carga reciente y menor recuperación explican la pesadez; los datos no establecen una causa médica.",
      },
      {
        question: "Mi carrera es en cuatro semanas. ¿Debería ajustar el plan?",
        calls: [
          ["list_competitions", "Buscar la próxima carrera y su fecha"],
          [
            "get_plan_adherence",
            "Revisar el cumplimiento de las últimas cuatro semanas",
          ],
          [
            "get_training_readiness",
            "Comprobar señales actuales de carga y forma",
          ],
        ],
        answer:
          "Faltan 28 días para la carrera. Completaste 16 de 18 sesiones previstas (89 %); tu forma está en −5 y la carga de 7 días sigue en tu rango habitual. Los datos no justifican un cambio grande ahora. Mantén el día de recuperación y vuelve a revisar tras la sesión clave del fin de semana. Esto no es una decisión médica ni de aptitud para competir.",
      },
      {
        question: "¿Ha mejorado realmente mi nivel corriendo?",
        calls: [
          ["get_fitness_trends", "Leer la tendencia de fitness de 12 semanas"],
          ["get_activity_statistics", "Comparar ritmo, duración y volumen"],
          ["get_personal_bests", "Comprobar mejores marcas recientes"],
        ],
        answer:
          "Tu VO₂max efectivo corriendo subió de 49,2 a 51,0 en 12 semanas y tu ritmo en la misma banda de pulso mejoró de 4:58/km a 4:46/km. Tu mejor marca en 5 km no cambió. Eso respalda una mejor eficiencia aeróbica, aunque todavía no un nuevo rendimiento en competición de 5 km.",
      },
    ],
    accessibleSummary:
      "Tres ejemplos animados de MCP alternan entre fatiga semanal, preparación de carrera y evolución corriendo. Cada ejemplo muestra las herramientas reales de Trainingload.ai usadas antes de dar una respuesta en texto.",
  },
  it: {
    demoLabel: "demo",
    connectedLabel: "connesso",
    scenarios: [
      {
        question:
          "Perché questa settimana sembra più dura della scorsa?",
        calls: [
          [
            "get_training_snapshot",
            "Carico attuale, forma, sessioni recenti e prossime",
          ],
          [
            "compare_training_periods",
            "Confronta questa settimana con la precedente",
          ],
          ["list_planned_workouts", "Controlla cosa resta in programma"],
        ],
        answer:
          "Il tuo carico su 7 giorni è 468 contro 397 la scorsa settimana (+18%), mentre la forma è scesa da +4 a −9. Due sessioni intense sono cadute in 48 ore e domani hai ancora 6 × 3 minuti di intervalli. Carico più alto e recupero ridotto spiegano la fatica; i dati non indicano una causa medica.",
      },
      {
        question: "La gara è tra quattro settimane. Devo adattare il piano?",
        calls: [
          ["list_competitions", "Trova la prossima gara e la data"],
          ["get_plan_adherence", "Verifica quattro settimane di aderenza"],
          [
            "get_training_readiness",
            "Controlla i segnali attuali di carico e forma",
          ],
        ],
        answer:
          "Mancano 28 giorni alla gara. Hai completato 16 delle 18 sessioni previste (89%); la forma è −5 e il carico a 7 giorni resta nella tua fascia recente. I dati non suggeriscono un grande cambio ora. Mantieni il giorno di recupero e rivaluta dopo la sessione chiave del weekend. Non è una valutazione medica né un’idoneità alla gara.",
      },
      {
        question: "Il mio livello nella corsa è davvero migliorato?",
        calls: [
          [
            "get_fitness_trends",
            "Leggi il trend di fitness nella corsa su 12 settimane",
          ],
          ["get_activity_statistics", "Confronta passo, durata e volume"],
          ["get_personal_bests", "Controlla i migliori tempi recenti"],
        ],
        answer:
          "Il VO₂max effettivo nella corsa è salito da 49,2 a 51,0 in 12 settimane e il passo nella stessa fascia cardiaca è migliorato da 4:58/km a 4:46/km. Il tuo miglior 5 km non è cambiato. Questo conferma una migliore efficienza aerobica, ma non ancora un nuovo risultato di gara sui 5 km.",
      },
    ],
    accessibleSummary:
      "Tre esempi MCP animati ruotano tra fatica settimanale, preparazione gara e progressi nella corsa. Ogni esempio mostra gli strumenti reali di Trainingload.ai richiamati prima della risposta testuale.",
  },
  "pt-BR": {
    demoLabel: "demo",
    connectedLabel: "conectado",
    scenarios: [
      {
        question: "Por que esta semana parece mais pesada que a passada?",
        calls: [
          [
            "get_training_snapshot",
            "Carga atual, forma, sessões recentes e próximos treinos",
          ],
          [
            "compare_training_periods",
            "Comparar esta semana com a semana passada",
          ],
          ["list_planned_workouts", "Verificar o que ainda está agendado"],
        ],
        answer:
          "Sua carga de 7 dias está em 468 contra 397 na semana passada (+18%), enquanto a forma caiu de +4 para −9. Duas sessões fortes aconteceram em 48 horas e amanhã ainda há 6 × 3 minutos de intervalados. A carga maior com menos recuperação explica a sensação mais pesada; os dados não indicam causa médica.",
      },
      {
        question: "Minha prova é em quatro semanas. Devo ajustar o plano?",
        calls: [
          ["list_competitions", "Encontrar a próxima prova e a data-alvo"],
          ["get_plan_adherence", "Revisar quatro semanas de execução do plano"],
          [
            "get_training_readiness",
            "Verificar sinais atuais de carga e forma",
          ],
        ],
        answer:
          "Faltam 28 dias para a prova. Você concluiu 16 das 18 sessões planejadas (89%); a forma atual é −5 e a carga de 7 dias segue na sua faixa recente. Os dados não justificam uma mudança grande agora. Mantenha o dia de recuperação e reavalie após o treino-chave do fim de semana. Isso não é uma decisão médica nem de liberação para competir.",
      },
      {
        question: "Meu condicionamento na corrida melhorou de verdade?",
        calls: [
          [
            "get_fitness_trends",
            "Ler a tendência de condicionamento na corrida em 12 semanas",
          ],
          ["get_activity_statistics", "Comparar ritmo, duração e volume"],
          ["get_personal_bests", "Conferir recordes recentes na corrida"],
        ],
        answer:
          "Seu VO₂max efetivo na corrida subiu de 49,2 para 51,0 em 12 semanas, e o ritmo na mesma faixa de frequência cardíaca melhorou de 4:58/km para 4:46/km. Seu recorde nos 5 km não mudou. Isso mostra melhor eficiência aeróbica, mas ainda não garante uma nova marca de prova nos 5 km.",
      },
    ],
    accessibleSummary:
      "Três exemplos animados de MCP alternam entre fadiga semanal, preparação para prova e condicionamento na corrida. Cada exemplo mostra as ferramentas reais do Trainingload.ai usadas antes da resposta em texto.",
  },
} as const satisfies Record<SupportedMcpLocale, McpTerminalCopy>;

export function getMcpTerminalCopy(lang: string): McpTerminalCopy {
  if (lang in MCP_TERMINAL_COPY) {
    return MCP_TERMINAL_COPY[lang as SupportedMcpLocale];
  }
  return MCP_TERMINAL_COPY.en;
}
