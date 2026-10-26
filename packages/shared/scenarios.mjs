// 新场景配置中心 —— 通用业务引擎按此驱动8个场景
// 每个场景：名称/分类/审批标题构造/prompt构造（输出严格JSON）
export const SCENARIOS = {
  // ── 通用 ───────────────────────────────
  contract: {
    name: '合同审查', category: '通用',
    itemLabel: '份合同',
    title: (p) => `${p.contractName} · 条款审查`,
    prompt: (p) => [
      `你是法务合同审查助手。对照公司标准条款逐项审查合同，只输出JSON。`,
      ``,
      `【公司标准条款】`,
      `1.付款：验收后30日内支付，预付款不超过合同总额30%`,
      `2.违约金：单次不超过合同总额20%，累计上限30%`,
      `3.知识产权：我方委托开发成果知识产权归我方所有`,
      `4.保密期限：合同终止后仍持续5年`,
      `5.争议解决：我方所在地法院管辖`,
      ``,
      `【待审查合同】${p.contractName}（甲方：我方 / 乙方：${p.counterparty} / 金额：${p.amount}）`,
      p.text,
      ``,
      `输出JSON：`,
      `{"clauses":[{"clause":"条款名","contract":"合同原文引用","standard":"标准要求","result":"pass|deviation|risk","note":"说明"}],`,
      `"riskLevel":"low|medium|high","summary":"一句话总评","suggestion":"修改建议"}`,
      `规则：contract字段必须引用合同原文；没有出现的标准条款按risk标注"缺失"。`,
    ].join('\n'),
  },

  credit: {
    name: '信贷初审', category: '通用',
    itemLabel: '位借款人',
    title: (p) => `${p.applicant} · 授信初审（申请${p.appliedAmount}万）`,
    prompt: (p) => [
      `你是信贷初审助手。基于借款人档案给出授信建议，只输出JSON。`,
      ``,
      `【授信政策】收入负债比(DTI)≤50%；征信近3月查询≥6次为警示；用途须合规（经营/消费/装修等）；月供收入比≤40%。`,
      ``,
      `【借款人档案】${p.applicant}，申请${p.appliedAmount}万，期限${p.termMonths}月，用途：${p.purpose}`,
      `月收入${p.monthlyIncome}元 | 现有负债月供${p.monthlyDebt}元 | 征信近3月查询${p.creditQueries}次 | 工作：${p.employment} | 备注：${p.note || '无'}`,
      ``,
      `输出JSON：`,
      `{"score":0-100,"checks":[{"item":"核查项(如收入负债比)","result":"pass|fail|warn","evidence":"数据依据"}],`,
      `"riskPoints":[{"point":"疑点","evidence":"档案原文/数据"}],"suggestedAmount":"建议授信额度(万)","rate":"建议利率","verdict":"approve|reduce|reject","summary":"一句话"}`,
      `规则：自己计算DTI与月供收入比；evidence必须给数值；verdict为最终建议（approve=足额/reduce=降额/reject=拒绝）。`,
    ].join('\n'),
  },

  // ── 互联网 ───────────────────────────────
  ugc: {
    name: '内容审核', category: '互联网',
    itemLabel: '条内容',
    title: (p) => `${p.author} 的${p.contentType} · 审核`,
    prompt: (p) => [
      `你是UGC内容审核助手。对内容做预审分级，只输出JSON。`,
      ``,
      `【审核标准】`,
      `通过：正常内容 | 可疑：擦边/疑似广告/情绪激烈但未违规——转人工复核 | 高危：辱骂攻击/违法引流/色情低俗/敏感谣言——删除或限流`,
      ``,
      `【待审内容】作者：${p.author}｜类型：${p.contentType}｜发布于：${p.channel}`,
      `"${p.content}"`,
      ``,
      `输出JSON：`,
      `{"level":"pass|suspicious|high_risk","reason":"判定理由(引用原文关键词)","suggestedAction":"none|review|delete|limit","tags":["违规类型标签"],"confidence":0-1}`,
      `规则：边界模糊的内容宁可标suspicious转人工，不要武断判高危；tags从[广告引流,辱骂攻击,低俗色情,敏感信息,谣言不实,正常]中选。`,
    ].join('\n'),
  },

  abtest: {
    name: 'A/B实验结论', category: '互联网',
    itemLabel: '个实验',
    title: (p) => `${p.experiment} · 全量决策`,
    prompt: (p) => [
      `你是数据分析助手，为A/B实验出具结论卡辅助全量决策，只输出JSON。`,
      ``,
      `【实验】${p.experiment}`,
      `假设：${p.hypothesis}`,
      `样本：对照组${p.control.users}用户 / 实验组${p.treatment.users}用户，运行${p.days}天`,
      `指标对比（实验组 vs 对照组）：`,
      ...p.metrics.map(m => `· ${m.name}：${m.treatment} vs ${m.control}（${m.isPrimary ? '核心指标' : '护栏指标'}，${m.lift}）`),
      ``,
      `输出JSON：`,
      `{"conclusion":"positive|negative|inconclusive","lift":"核心指标提升幅度","confidence":"统计置信度描述","guards":"护栏指标情况",`,
      `"risks":["风险/副作用"],"recommendation":"rollout|hold|iterate|stop","reasoning":"依据"}`,
      `规则：样本不足时结论只能是inconclusive；护栏指标恶化必须列入risks；recommendation为全量建议（rollout=全量/hold=继续观察/iterate=迭代再验/stop=停止）。`,
    ].join('\n'),
  },

  // ── 制造业 ───────────────────────────────
  equipment: {
    name: '设备维护', category: '制造业',
    itemLabel: '台设备',
    title: (p) => `${p.equipmentName} · 健康评估`,
    prompt: (p) => [
      `你是设备预测性维护助手。基于传感器与维修数据评估设备健康度，只输出JSON。`,
      ``,
      `【设备】${p.equipmentName}（${p.type}，已运行${p.runningHours}小时，上次保养：${p.lastMaintenance}）`,
      `近30日振动均值 ${p.vibration}mm/s（警戒值7.1）｜温度均值 ${p.temperature}℃（警戒值75）`,
      `近90日停机${p.downtimeCount}次，累计${p.downtimeHours}小时，原因：${p.downtimeReasons}`,
      `维修记录：${p.repairHistory}`,
      ``,
      `输出JSON：`,
      `{"health":0-100,"failureRisk":"low|medium|high","riskWindow":"预计风险窗口","evidence":["依据1(引用数值)","2"],`,
      `"suggestion":"维护建议","window":"建议停机窗口","spares":["建议备件"],"priority":"routine|urgent|critical"}`,
      `规则：evidence必须引用具体数值对比警戒值；priority为critical时必须建议立即安排窗口。`,
    ].join('\n'),
  },

  // ── 政务 ───────────────────────────────
  policy: {
    name: '政策匹配', category: '政务',
    itemLabel: '家企业',
    title: (p) => `${p.company} · 政策匹配`,
    prompt: (p) => [
      `你是惠企政策匹配助手（"政策找企"）。为企业匹配可申报政策并预检材料，只输出JSON。`,
      ``,
      `【政策库】`,
      ...p.policies.map((pol, i) => `${i + 1}. ${pol.name}（${pol.dept}）：${pol.conditions.join('；')}｜资助：${pol.benefit}｜材料：${pol.materials.join('、')}`),
      ``,
      `【企业画像】${p.company}`,
      `行业：${p.industry}｜规模：${p.scale}｜员工${p.employees}人｜年营收${p.revenue}｜成立${p.foundedYears}年｜资质：${p.qualifications.join('、') || '无'}｜研发投入占比${p.rdRatio}｜${p.extra || ''}`,
      ``,
      `输出JSON：`,
      `{"matches":[{"policy":"政策名","eligible":"yes|borderline|no","reason":"条件符合情况","estimatedAmount":"预估金额",`,
      `"materialsStatus":[{"material":"材料","status":"ready|missing","note":"说明"}]}],`,
      `"pushList":["建议推送的政策名"],"summary":"一句话"}`,
      `规则：逐条政策核对全部条件，borderline用于条件边界模糊的情形；材料按企业现有资质预判ready/missing。`,
    ].join('\n'),
  },

  ticket: {
    name: '12345分派', category: '政务',
    itemLabel: '条工单',
    title: (p) => `工单${p.ticketNo ?? p.caseNo} · ${p.category || '分派'}`,
    prompt: (p) => [
      `你是12345热线工单智能分派助手。对工单分类定责，只输出JSON。`,
      ``,
      `【定责目录】城管局（市容/违建/占道）｜住建局（物业/房屋质量/燃气）｜交通局（道路/公交/出租）｜市场监管局（消费纠纷/食品安全/价格）｜生态环境局（噪声/污染）｜人社局（欠薪/社保）｜卫健委（医疗纠纷）｜街道办（社区事务/邻里纠纷兜底）`,
      ``,
      `【工单】编号${p.ticketNo ?? p.caseNo}｜来源：${p.source}｜诉求人：${p.caller}`,
      `"${p.content}"`,
      ``,
      `输出JSON：`,
      `{"category":"问题分类","department":"建议责任部门","urgency":"normal|urgent|emergency","reason":"定责理由(引用工单原文)",`,
      `"similarCase":"相似历史案例描述","slaHours":"建议办结时限(小时)","transferNote":"转办备注"}`,
      `规则：涉及人身安全/大面积停水停电为emergency；职责交叉时选主责部门并在transferNote说明需会办部门。`,
    ].join('\n'),
  },
};

export const CATEGORY_ORDER = ['通用', '互联网', '制造业', '政务'];
