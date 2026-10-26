-- 电商演示库（智能问数场景）
CREATE TABLE IF NOT EXISTS region (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(16) NOT NULL UNIQUE,
  provinces JSON NOT NULL,
  note VARCHAR(255) DEFAULT NULL COMMENT '区域口径注释：华南=广东+广西+海南（含广西，不含港澳台，福建属华东）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) NOT NULL,
  province VARCHAR(16) NOT NULL,
  city VARCHAR(32) NOT NULL,
  region_id INT NOT NULL,
  level VARCHAR(8) NOT NULL DEFAULT '普通',
  registered_at DATETIME NOT NULL,
  KEY idx_region (region_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS category (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  category_id INT NOT NULL,
  brand VARCHAR(32) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  KEY idx_cat (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(32) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  region_id INT NOT NULL,
  status VARCHAR(12) NOT NULL COMMENT 'paid/shipped/completed/cancelled',
  pay_amount DECIMAL(12,2) NOT NULL COMMENT '实付金额=商品优惠后总额,不含运费',
  freight DECIMAL(8,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL COMMENT '下单时间',
  paid_at DATETIME DEFAULT NULL COMMENT '支付时间,cancelled为NULL',
  KEY idx_created (created_at),
  KEY idx_region (region_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL COMMENT '成交单价',
  subtotal DECIMAL(12,2) NOT NULL,
  KEY idx_order (order_id),
  KEY idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refund (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  order_item_id INT NOT NULL,
  quantity INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(64) NOT NULL,
  status VARCHAR(12) NOT NULL COMMENT 'pending/success/rejected',
  created_at DATETIME NOT NULL,
  KEY idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 应用表（四场景 + 审计）
CREATE TABLE IF NOT EXISTS jd (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(64) NOT NULL,
  dept VARCHAR(64),
  content MEDIUMTEXT NOT NULL,
  hard_req JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resume (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(128) NOT NULL,
  file_type VARCHAR(8) NOT NULL,
  raw_text MEDIUMTEXT,
  anonymized_text MEDIUMTEXT,
  parse_ok TINYINT DEFAULT 1,
  edge_tags JSON COMMENT '埋点标签:gap/conflict/vague/bilingual/scan/elite/trap',
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS screening_result (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resume_id INT NOT NULL,
  jd_id INT NOT NULL,
  score INT,
  card JSON,
  blind TINYINT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'pending',
  decided_by VARCHAR(32),
  decided_at DATETIME,
  reject_reasons JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sql_query_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64),
  question TEXT NOT NULL,
  sql_text MEDIUMTEXT,
  interpretation TEXT,
  status VARCHAR(16) DEFAULT 'drafting' COMMENT 'drafting/proposing/approved/rejected/executed/failed',
  chart JSON,
  rows_returned INT,
  duration_ms INT,
  reject_reasons JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sql_example (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question TEXT NOT NULL,
  sql_text MEDIUMTEXT NOT NULL,
  interpretation TEXT,
  source VARCHAR(16) DEFAULT 'agent' COMMENT 'agent=审批通过后自动沉淀',
  enabled TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS match_case (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_no VARCHAR(32) NOT NULL,
  po JSON NOT NULL,
  receipt JSON NOT NULL,
  invoice JSON NOT NULL,
  diff JSON,
  analysis JSON,
  disposition VARCHAR(24) COMMENT 'auto_pass/exempt/reject_invoice/hold/adjust',
  status VARCHAR(16) DEFAULT 'pending' COMMENT 'pending/auto_passed/proposing/approved/rejected',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gov_case (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matter VARCHAR(64) NOT NULL,
  applicant VARCHAR(32),
  files JSON NOT NULL,
  report JSON,
  status VARCHAR(16) DEFAULT 'pending' COMMENT 'pending/proposing/approved/rejected',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS approval_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scenario VARCHAR(16) NOT NULL COMMENT 'ask/resume/match/gov',
  session_id VARCHAR(64),
  ref_type VARCHAR(24) NOT NULL,
  ref_id INT NOT NULL,
  title VARCHAR(255),
  card JSON NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending',
  decided_by VARCHAR(32),
  decided_at DATETIME,
  reject_reasons JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_status (status),
  KEY idx_scenario (scenario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS session_map (
  id INT AUTO_INCREMENT PRIMARY KEY,
  opencode_session_id VARCHAR(64),
  scenario VARCHAR(16),
  ref_type VARCHAR(24),
  ref_id INT,
  status VARCHAR(12) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 真实访问统计（UV/在线/功能使用）
CREATE TABLE IF NOT EXISTS biz_case (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scenario VARCHAR(24) NOT NULL,
  case_no VARCHAR(32) NOT NULL,
  title VARCHAR(255),
  payload JSON NOT NULL,
  analysis JSON,
  status VARCHAR(16) DEFAULT 'pending',
  disposition VARCHAR(32),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_scenario (scenario), KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS analytics_event (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  visitor_id VARCHAR(40) NOT NULL,
  type VARCHAR(12) NOT NULL COMMENT 'visit/heartbeat/usage',
  scenario VARCHAR(24) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_type_time (type, created_at),
  KEY idx_visitor_type (visitor_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 内置两个JD（来自真实JD样本，见 ai-showcase/03-业务知识/简历初筛）
INSERT IGNORE INTO jd (id, title, dept, content, hard_req) VALUES
(1, '后台开发工程师', '技术部',
'【职责】主导核心系统开发，满足功能、性能、可靠性、可维护性与可扩展性需求。
【要求】1.本科及以上学历，计算机相关专业；2.2年以上后端开发经验；3.熟悉Linux开发环境；4.精通Java/Go/C++至少一门语言；5.深入理解数据结构与算法。',
JSON_ARRAY('本科及以上', '2年以上后端经验', 'Java/Go/C++至少一门')),
(2, '销售代表（快消）', '销售部',
'【职责】负责综合渠道系统门店的开拓与入驻落地；维护区域客户关系；完成区域销售目标。
【要求】1.统招本科及以上学历，专业不限；2.3年以内快消行业销售经验；3.接受区域外派出差；4.较强的沟通谈判能力。',
JSON_ARRAY('统招本科及以上', '3年以内快消销售经验', '接受出差'));
