# Coursework 改造计划（Refinement + Composition）

## 1. 项目定位
- 目标题目：**Evidence-Grounded Multi-Modal Academic Matching Pipeline**
- 课程对齐：
  - **Composition Demo**：多模态、多阶段 pipeline（CV -> 兴趣画像 -> 匹配 -> 生成）
  - **Refinement Demo**：轻量模型改造（instruction distillation + LoRA）并做前后对比
- 核心价值：输出结果必须可解释、可追溯（每条匹配理由都绑定论文证据）

## 2. 最终在线 Pipeline（演示主线）
1. 上传学生 CV（PDF/图片）
2. 视觉步骤提取结构化信息（domains/methods/skills/projects/publications）
3. 小模型 A 生成 `student_interest_summary`
4. 抓取教授 publication（现有 Scholar 流程复用）
5. 小模型 A 生成 `professor_interest_summary`
6. Embedding 计算匹配分，并输出 Top-K 证据对齐（学生点 vs 教授论文）
7. 小模型 A 生成 `match_reason` 与 `customized_email`
8. 校验器检查“无证据陈述”，不通过则自动重写

## 3. 关键中间输出（可视化展示）
- `student_interest_summary`
  - core domains
  - methods
  - applications
  - goal statement
- `professor_interest_summary`
  - themes
  - each theme -> evidence paper IDs
- `matching_result`
  - overall score
  - top aligned pairs
  - risk flags
- `generation_result`
  - evidence-grounded reason
  - email draft
  - verification status

## 4. 模型策略（结合 5090）
- 视觉模型 V：轻量 VLM（优先）或 OCR + LLM 备选
- 文本小模型 A：7B 级（LoRA/QLoRA）
- 匹配：Embedding 模型（可加 reranker）
- Teacher（离线）：Gemini 或其他大模型，仅用于生成训练监督数据

## 5. 训练路线（报告可直接写）
- 方法名：**Instruction Distillation + LoRA Fine-tuning**
- 含义：
  - Teacher 生成高质量结构化标签
  - Student 用 LoRA 学习这些标签格式与推理模式
- 说明：这不是传统 logits KD，而是课程里完全可接受的蒸馏形式

## 6. 数据构建计划（蒸馏数据）
- 样本类型：
  1. `student_summary`：CV结构化输入 -> 学生兴趣画像
  2. `professor_summary`：论文列表输入 -> 教授主题+证据
  3. `match_reasoning`：双侧画像+向量对齐 -> match level + evidence reason
  4. `email_generation`：证据输入 -> 可用邮件草稿
- 数据格式：JSONL（每行一条任务样本）
- 质量要求：保留 paper IDs，避免“无来源结论”

## 7. 14天执行排期
### Day 1-2：方案冻结
- 确定所有中间 JSON schema
- 确定最终评测指标

### Day 3-4：多模态输入打通
- 完成 CV PDF/图片解析
- 输出稳定结构化字段

### Day 5-6：双侧兴趣画像
- 学生兴趣总结
- 教授兴趣总结（带证据 paper IDs）

### Day 7：匹配层完成
- Embedding 打分
- Top-K 证据对齐

### Day 8：生成与校验闭环
- 生成理由与邮件
- 无证据陈述检测与自动重写

### Day 9-10：蒸馏数据生成
- 用 Teacher 生成 1k-3k 条高质量样本

### Day 11-12：LoRA 微调与替换
- 训练 student adapter
- 替换线上 baseline 做对比

### Day 13：评测与可视化
- 输出对比表（质量/延迟/成本）
- 页面展示每一步输入输出

### Day 14：提交物打包
- Hugging Face Space 演示版本
- 报告与演示视频

## 8. 评测指标（至少）
1. 匹配质量（Top-1/Top-3 人工一致性）
2. 证据一致性（claim 是否可回溯）
3. 邮件可用率（人工评分）
4. 延迟与成本（单样本）

## 9. 风险与保底策略
- 风险：VLM 解析不稳
  - 保底：切换 OCR + LLM 两段式
- 风险：LoRA 提升不明显
  - 保底：保留 baseline + prompt 约束，并强调证据链价值
- 风险：时间不足
  - 保底优先级：
    1. 证据对齐
    2. pipeline 可视化
    3. baseline vs 改造后对比

## 10. 最终提交最小高分包
1. 可在线运行 demo（HF Space）
2. 一张清晰 pipeline 图
3. baseline vs 改造后对比表
4. 至少一个完整案例（从 CV 到最终邮件的证据链）

---

## 附：一句话项目摘要（可用于报告/答辩）
We build an evidence-grounded multi-modal composition pipeline for academic outreach, and refine a lightweight student model via instruction distillation + LoRA to improve quality-latency-cost tradeoff while preserving explainability.
