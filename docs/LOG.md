# 开发日志（真源）

需求见 `warriors-graph-spec.md`；本文件记录调研结论、决策和进度。

## 决策

| 日期 | 决策 | 原因 |
|---|---|---|
| 2026-10-23 | 中文名走「词根拼合 + 人工校对」，不用 langlinks | langlinks 覆盖率低（P1 128 只里仅 10 只）且不是大陆版（沙风/黑莓掌/火爪，大陆版是沙暴/棘爪） |
| 2026-10-23 | 大陆版 -paw 译「爪」 | 用户确认 |
| 2026-10-23 | 幼崽名（-kit）一律显示英文；Rusty 等拿不准的名字显示英文 | 用户确认：拿不准就用英文 |
| 2026-10-23 | 词根拼出的中文名显示，但标「待核」；有任一词根未知则 zh 留空显示英文 | 同上 |
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

## 解析要点（踩过的坑）

- `pastaffie` **不按时间排序**（虎星：黑森林、雷族（流放）、影族、虎族、浪猫），族群经历只列不排；主族群推断见 `scripts/parse.mjs` 的 `homeClan`：affie 是活着的族群就用它，否则在过去的族群中排除带囚禁/短暂/出生/流放备注的，优先五大族。
- 下落不明的猫没有 `affie`，用 `lastknown`。
- 名字字段给的阶段不可靠（`mca=Cinderpaw, Cinderpelt`），按后缀 -kit/-paw 校正。
- 毛色正则要加词边界，否则 "furred" 会命中 red。
- 前端力导向的连线参数按边类型取值，新增边类型时必须补上，否则 NaN 导致整张图消失。
