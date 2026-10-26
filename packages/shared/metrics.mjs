// 指标口径字典 —— 问数场景的语义层（get_schema 工具与前端指标抽屉共用）
// 口径边界是演示重点：同一名词的不同口径必须有明确声明

export const METRICS_DICT = [
  {
    name: '销量',
    definition: '已支付订单的商品销售件数总和',
    formula: 'SUM(order_item.quantity)，订单状态须为 paid/shipped/completed',
    pitfalls: [
      '不含 cancelled 订单',
      '默认按支付时间(paid_at)统计，不按下单时间(created_at)',
      '退款后是否扣减见「退款净量」',
    ],
  },
  {
    name: '销量(退款净量)',
    definition: '销量扣除退款成功的件数',
    formula: '销量 - SUM(refund.quantity where status=success)',
    pitfalls: ['业务说"实际卖出多少"时用这个口径'],
  },
  {
    name: '销售额',
    definition: '已支付订单的实付金额总和',
    formula: 'SUM(orders.pay_amount)，订单状态须为 paid/shipped/completed',
    pitfalls: ['实付=原价-优惠，不含运费(freight)', '含退款前口径；要扣退款用 GMV净额'],
  },
  {
    name: 'GMV净额',
    definition: '销售额 - 退款成功金额',
    formula: 'SUM(orders.pay_amount) - SUM(refund.amount where status=success)',
    pitfalls: ['对外汇报常用口径；管理层问"GMV"默认用这个'],
  },
  {
    name: '客单价',
    definition: '销售额 / 下单用户数（去重）',
    formula: 'SUM(pay_amount) / COUNT(DISTINCT customer_id)',
    pitfalls: ['分母是"用户"不是"订单"——另一个常见口径是笔单价=销售额/订单数'],
  },
  {
    name: '退款率',
    definition: '退款成功金额 / 销售额',
    formula: 'SUM(refund.amount where success) / SUM(orders.pay_amount)',
    pitfalls: ['按金额还是按件数算，结果不同，需确认'],
  },
  {
    name: '华南区',
    definition: 'region 表中华南 = 广东、广西、海南',
    formula: "region.name='华南'，province IN (广东,广西,海南)",
    pitfalls: ['含广西（部分公司口径不含）', '不含港澳台', '福建属华东，不属华南'],
  },
];

export const REGION_SPLIT = {
  华北: ['北京', '天津', '河北', '山西', '内蒙古'],
  华东: ['上海', '江苏', '浙江', '安徽', '福建', '江西', '山东'],
  华南: ['广东', '广西', '海南'],
  西南: ['重庆', '四川', '贵州', '云南', '西藏'],
  西北: ['陕西', '甘肃', '青海', '宁夏', '新疆'],
  东北: ['辽宁', '吉林', '黑龙江'],
};

// 电商演示库表结构摘要（与 scripts/db/01-schema.sql 保持一致）
export const SCHEMA_DIGEST = `
region(id, name[华北/华东/华南/西南/西北/东北], provinces JSON, note)
customer(id, name, province, city, level[普通/银卡/金卡/黑卡], registered_at)
category(id, name[10个类目], parent_id)
product(id, sku, name, category_id, brand, unit_price)
orders(id, order_no, customer_id, region_id, status[paid/shipped/completed/cancelled],
       pay_amount, freight, created_at 下单时间, paid_at 支付时间)
order_item(id, order_id, product_id, quantity, unit_price 成交单价, subtotal)
refund(id, order_id, order_item_id, quantity, amount, reason, status[pending/success/rejected], created_at)
`;

export const ASK_RULES = `
规则：
1. 先用 get_schema 获取表结构、指标口径字典和已确认的示例问答，再生成SQL。
2. 指标口径必须查字典：业务问"销量"默认已支付口径；"GMV"默认净额口径；"华南区"=广东+广西+海南。
3. 生成SQL后必须调用 submit_proposal 提交审批（附一句自然语言解释，让非技术的人也能确认），等待人工裁决。
4. 只有审批通过才能调用 run_sql；被驳回要根据驳回原因修改后重新提交。
5. run_sql 成功后基于结果给出简短结论，并建议图表类型(bar/line/pie)。
6. 永远不要在没有审批的情况下执行SQL。
`;
