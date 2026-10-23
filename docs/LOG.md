# 开发日志（真源）

需求见 `warriors-graph-spec.md`；本文件记录调研结论、决策和进度。

## 决策

| 日期 | 决策 | 原因 |
|---|---|---|
| 2026-10-23 | 中文名走「词根拼合 + 人工校对」 | langlinks 覆盖率低（P1 128 只里仅 10 只） |
| 2026-10-23 | **更正**：沙风/黑莓掌/火爪 才是大陆版，沙暴/棘爪/暗纹/蕨云是台版（早先判断反了）；中文名优先级 = 人工 `zh-overrides.csv` → 导入 `zh-sources.csv` → 幼崽留英文 → 词根拼合 | 中文维基百科 `Template:CGroup/Warriors` 两岸转换表明示 zh-cn/zh-tw 对照 |
| 2026-10-23 | 大陆版 -paw 译「爪」、-claw 译「掌」 | -paw 用户确认；-claw 见维基百科转换表（虎掌、黑莓掌） |
| 2026-10-23 | 幼崽名（-kit）一律显示英文；Rusty 等拿不准的名字显示英文 | 用户确认：拿不准就用英文 |
| 2026-10-23 | 词根拼出的中文名显示，但标「待核」；有任一词根未知则 zh 留空显示英文 | 同上 |
| 2026-10-23 | 星系视图只用星点，不显示猫脸头像 | 拉近后头像太大、互相遮挡（用户反馈） |
| 2026-10-23 | 养父母单独存为 `adoptive` 边，不混入 `parent` | 剧情关键（如松鸦羽三兄妹由松鼠飞抚养），孩子验收会核对 |

## Wiki 调研结论（2026-10-23，API `https://warriors.fandom.com/api.php`）

- **信息框**：模板 `{{Charcat ...}}`。主要角色（77 个）写在 `Template:Charcat/<页名>` 子页并以 `{{Charcat/<页名>}}` 嵌入正文；其他角色直接写在正文里。
- **名字字段**（按时间顺序排列）：`kit` `kkittypet` `kittypet` `loner` `rogue` `apprentice` `mca`(巫医学徒) `warrior` `mc`(巫医) `deputy` `leader` `elder` `starclan resident` 等；值形如 `Firepaw{{r/book|os1|37}}`，可能多个名字用逗号或 `<br />` 分隔。
- **族群**：`affie`（当前）、`pastaffie`（过去，按时间顺序，`<br />` 分隔），值为 `{{ThunderClan|ref}}` 这类模板。
- **关系字段**：`father` `mother` `adoptive mother/father`；`mate`/`mates`；`son(s)` `daughter(s)` `child`；`mentor(s)` `temporary mentors`；`app(s)` `temporary app` `unofficial apps`；兄弟姐妹字段忽略（由共同父母推导）。值为 `[[页名|显示名]]`，链接可能是重定向（如 `[[Squirrelstar]]`），需要解析重定向。
- **死亡**：`death=Wounds{{r/book|om6|324}}`，书目代码即可推出死亡的部。
- **分类**：`<部名>_characters`（如 `The_Prophecies_Begin_characters`）给出出场的部；`Toms`/`She-cats` 给出性别；`Deceased_characters` 给出是否已故。
- **毛色**：正文首句 `'''Name''' is a ... tom/she-cat`。
- **书目代码**（`Module:References/Book Data`）：os=TPB、np=TNP、po=PO3、om=OotS、dc=DotC、vs=AVoS、tbc=TBC、asc=A Starless Clan、cs=Changing Skies；外传有 bp/fq 等。
- 中文 Fandom（`warriors.fandom.com/zh`）用的是非大陆版译名，不可用。

## 进度

- [x] Demo：星系视图 + 手工数据（已删除，由正式数据替代）
- [x] P1 数据管道（2026-10-23）：`npm run data`（= `data:fetch` + `data:parse`）。第一部 128 页 → 124 只猫、179 条边（血缘 77 / 师徒 72 / 伴侣 21 / 养亲 9）；另有 370 条边指向第一部以外的猫，P1 丢弃
- [x] P1 前端切换到正式数据（`src/data.js` 为共用数据层）
- [ ] 中文名：词根表 `config/zh-parts.csv` 已覆盖 112 个名字；缺约 40 个前缀（Ash、Cinder、Reed、Rowan…）待大陆版确认；单词名（Princess、Scourge…）走 `config/zh-overrides.csv`
- [ ] P1 iPad 实测性能
- [x] P2 视觉（2026-10-23）：程序生成猫脸 `src/avatar.js`（底色×花纹×族群色外圈，同组合共用 canvas），用于详情面板、搜索结果、家谱视图。星团、流动光点、名字标签、辉光开关在 demo 阶段已完成
  - **星系里不放猫脸**（用户 2026-10-23 决定：拉近后每个点太大、互相遮挡）。曾做过「拉近星点渐变成猫脸」的 LOD，已移除，见提交 d0bcf15；星系名字标签的近距离显示阈值从 165 降到 90，避免拉近时标签挤成一团
- [x] P3 家谱视图（2026-10-23）：`src/family.js`（Cytoscape + ELK 分层）；URL hash 路由 `#galaxy[/猫]`、`#family/猫`（`src/main.js`）；面板「看家谱 / 在星系中定位」联动；上下代数可调（存 localStorage）。代码拆为 galaxy / family / panel / search / util 模块
  - 子图规则：主干 = 祖先 + 中心 + 兄弟姐妹 + 后代；主干成员的另一位亲生父母作为配偶加入但不再扩展；只知一位亲生父母时补「未知」节点
  - 父母→结合点→子女；养亲也经过一个小节点（否则路径短一跳，同代错行）
  - **同代对齐靠 ELK 分区**（`elk.partitioning.partition` = 2×代数，结合点 +1），光靠最长路径分层会错行
  - 父母→结合点用直线（V 字），用折线时同一行多对伴侣会叠成一条水平线
  - 加新依赖后 Vite 依赖预构建会过期（504 Outdated Optimize Dep，页面白屏），需删 `node_modules/.vite` 重启
- [x] P4 全量 + 时间轴（2026-10-23）：抓取 `Category:Characters`（1579 页，95 个请求约 1 分 48 秒）→ 1557 只猫、1887 条边（血缘 1113 / 师徒 524 / 伴侣 198 / 养亲 52），超出范围的边 142 条；首次出场：第一部 124 … 第九部 54，外传 769（只在超级版/中篇/指南出场的配角）
  - 时间轴（星系底部）：默认关闭显示全部；打开后只点亮到当前部为止出场的猫，本部新出场的「点亮」脉冲，deathArc ≤ 当前部的变星族色；可自动播放（每部 2.5 秒）
  - 图例可点击，按族群/关系类型筛选；筛掉的星淡出（opacity 0.02）不删除，点击淡出的星等同点空白
  - 家谱：同一组养父母共用一个养亲结合点（否则多个养子女时虚线绕成一团）
  - 电脑 Chrome 1557 星约 95 fps；**iPad 未实测**
- [x] 中文名来源调研（2026-10-23）：`npm run data:zh` → `config/zh-sources.csv`
  - 中文维基百科 `Template:CGroup/Warriors` + `Module:CGroup/Warriors`：约 100 个猫名的 zh-cn/zh-tw 对照（另含书名、术语）
  - 中文 Fandom（warriors.fandom.com/zh，120 篇）：条目标题是大陆版现用名，经语言链接对应英文页名
  - 灰机 wiki（warriors.huijiwiki.com）规模最大、两岸译名都有，但 Cloudflare 人机验证拦脚本（403），**不绕过**；只能由用户在浏览器里看
  - 风险：大陆第一部有中少社、未来社两个版本，译名可能不同，待孩子对照书确认（沙风还是沙暴、黑莓掌还是棘爪）
  - 导入后：导入 124 + 词根 334 个名字有中文，1340 个仍为英文
- [ ] 中文名（旧记录，导入前）：全量 1508 个非幼崽名字没有中文。缺得最多的前缀 Owl/Dawn/Gorse/Birch/Reed/Sun/Ash/Hare…，后缀 wing/berry/storm…；650 个名字前后缀都不认识（多为外传配角、部落猫、两脚兽家的猫）

## 解析要点（踩过的坑）

- `pastaffie` **不按时间排序**（虎星：黑森林、雷族（流放）、影族、虎族、浪猫），族群经历只列不排；主族群推断见 `scripts/parse.mjs` 的 `homeClan`：affie 是活着的族群就用它，否则在过去的族群中排除带囚禁/短暂/出生/流放备注的，优先五大族。
- 下落不明的猫没有 `affie`，用 `lastknown`。
- 名字字段给的阶段不可靠（`mca=Cinderpaw, Cinderpelt`），按后缀 -kit/-paw 校正。
- 毛色正则要加词边界，否则 "furred" 会命中 red。
- 第九部的整部分类（`Changing Skies characters`）在页面分类里取不到，改为同时按**单本书分类**（`<书名> characters`，书名来自 `Module:References/Book Data`）判断属于哪一部。
- 死于哪一部：`death` 字段引用的书属于正传就用它；死在外传里时取 `deadbooks` 中最早的正传部。
- 族群黎明（第五部）的营地模板（Clear Sky's camp 等）映射到对应五大族；叛军、guardian cats 等临时团伙忽略。
- 冒名：Ashfur 的信息框 `leader = Bramblestar`（附身冒充），用 `IMPOSTOR_NAMES` 排除，否则他显示成「黑莓星」。
- 前端力导向的连线参数按边类型取值，新增边类型时必须补上，否则 NaN 导致整张图消失。
