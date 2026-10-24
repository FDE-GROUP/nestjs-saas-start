# TypeScript 注释规范（TSDoc Comment Standards）

> 状态：现行 · 适用仓库：`nestjs-saas-start` · 关联文档：[tooling-standards.md](./tooling-standards.md)（§2 工具矩阵 TypeDoc 行 / §4.6 API 文档 / §7 命令速查）、[architecture.md](./architecture.md)（垂直切片分层）、[workflow.md](./workflow.md)（审计门 / 高危签核）、来源方案 [global-tsdoc-typedoc-docgen](../plans/global-tsdoc-typedoc-docgen.md)
> 受众: **人 + Agent**（`读者: Agent`——书写 TypeScript 注释时须遵循本规范）
> 定位: 本文件是「**TS 注释怎么写**」的**裁决单源（SSOT）**。工具选型（TypeDoc 配置项、`docs:api` 命令）以 `tooling-standards` + 实存 `typedoc.json` 为准，本文件**不复述配置细节**，只定书写纪律与对外边界；二者冲突时：配置/产物事实 > 本文件。

---

## 0. 一句话原则

注释是**给人读的设计说明**，同时**机器可解析为公共 API 参考**。写法遵循 [TSDoc](https://tsdoc.org/)：`/** … */` 块 + 中文 `summary` 首行 + 结构化块标签 + 显式发布修饰符（`@public`/`@internal`）。**纯注释、零行为**——本规范永不以注释之名改动代码语义。

## 1. 适用范围（哪些符号受约束）

「对外 API 面」= 会被 TypeDoc 收进公共参考、消费者会 import 的符号。逐包界定：

| 区域 | 纳入 | 排除 |
|------|------|------|
| `libs/contracts/src` | 全部导出（请求/响应/envelope 的 zod schema const + 派生型 + wire enum） | — |
| `libs/core/src` | `shared-kernel` + `tenant-isolation`/`authorization`/`platform` 契约 + `modules/**` 领域层公共符号 | barrel `index.ts` 不改 |
| `apps/api/src/modules/<ctx>` | `api/**` + `domain/**` + `application/**` | **`infrastructure/**`** + `*.module.ts` + 纯派生内部件 |
| `apps/web` | **暂不纳入**（前端组件非对外 API 面·来源方案裁点 ⓓ） | — |

> 边界靠 `typedoc.json` 的 `entryPoints` 逐层列目录 + `entryPointStrategy:"expand"` 兑现，而非注释里事后剔除。新增对外模块 = 同步在 `entryPoints` 登记其 `api/domain/application` 子目录。

## 2. 语言与结构

- **中文优先**：`summary` 首行**必须中文**（AGENTS §6）。既有中英 `@remarks`/why 散文**原样保留、不改语义**，只重排为 TSDoc 合法结构。
- **双段式**：`summary`（一句话职责·动词或定名词短语，句末以 `。` 收尾）+ `@remarks`（承既有设计动机 / 权衡 / 约束的 why 散文）。简单符号仅 `summary` 即可，不强制 `@remarks`。
- **不写可推知之物**：不重复签名本身（`foo(a: string): void` 的 summary 不该是「接收 string 返回 void」）。

```ts
/** 跨租户列表查询处理器（FR-6·平台级读侧）。
 *
 * @remarks
 * 委派治理端口分页取租户列表；平台经营者可见全部租户，结果绝不泄漏进租户作用域切片。
 * @public
 */
```

## 3. 发布修饰符（三档·显式标注）

仍走 TSDoc release tag，且**已文档化的公开符号一律显式标 `@public`**（不依赖「默认即 public」——显式优先，防漏标漂移）：

| 修饰符 | 用途 | 产物表现（`excludeNotDocumented:true` + `excludeInternal:true`） |
|--------|------|------|
| `@public` | 对外契约符号（schema/型/类/接口/方法/DI token/词汇别名） | 进公共参考 |
| `@internal` | 装配件、旁路表、纯内部实现 | **有意剔除**（无注释=隐身；显式 `@internal`=有据的排除，二者语义不同） |
| `@private`/`@protected` | 类成员可见性 | `excludePrivate/Protected:true` 剔除 |

- **DI 注入 token**（`= Symbol(...)`）：中文单行 summary「…端口 DI 注入 token」+ `@public`（对齐全仓同类 token 惯例）。
- 判 `@public` vs `@internal` 的唯一依据是「**消费者是否应引用它**」，不是「是否被 import 过」。

## 4. 块标签要求（何时必填 / 可省）

| 标签 | 规则 |
|------|------|
| `@param x - …` | 非平凡**公开方法 / 端点 / 导出纯函数**必填；参数名后带连字符（TSDoc 惯例）。自明参数（无副作用的一参 getter 等）可省。 |
| `@returns …` | 显式**非 void** 返回的公开方法/函数必填，说明返回形状语义（非重述类型）。 |
| `@throws {Type} …` | 有**契约级异常**（4xx/具名 Error）时补；建议带 `{Type}`。 |
| `@example` | 复杂/易误用的公开 API 建议给可运行片段；围栏用 TSDoc 支持的 code block。 |
| `@deprecated` | 废弃符号必用，**须带替代方案**。 |
| `{@link X}` | 内联交叉引用，见 §7 陷阱。 |

- **构造器 doc 可 `@param`-only**（无散文 summary 合法·类级 summary 已释义构造器）；不为此造 summary。
- `summary` 必须**附着到正确符号**（见 §6）。

## 5. 类型别名与派生词汇（订正口径）

**词汇型/契约引用的联合类型必须文档化**——消费者 import 引用的正是这些 union 名，隐身即真缺口：

- 若 `export type X = (typeof CONST)[...]` 之 X **进入对外签名 / 被 `libs/contracts`·api 契约引用**（如 `OrganizationStatus`/`SystemRoleKey`/`ErrorCodeValue`）：在 `export type` 行上方给**中文单行 summary + `@public`**，指向载体 const（`自 \`CONST\` 派生`），**不复述**载体散文。
- 若为**纯内部、无对外引用**的派生别名：可不注，靠 `excludeNotDocumented` 自动隐身。
- 判据：**同文件兄弟别名是否已成页**——成页即证明本仓惯例是「有意义的派生词汇要文档化」，不得反用「type alias 一律不加注」。

## 6. 附着规则（TypeDoc `excludeNotDocumented` 语义核心）

`excludeNotDocumented:true` 下，**doc 块必须紧贴符号**才会渲染，否则「写了注释却没页」：

- **类头富散文不得 detached**：若类文档夹在 `import` 与一个非导出窄接口之间、后跟空行，则**不附着主类** → 无页。修法 = 把散文块**下移到主类的装饰器块（`@ApiExtraModels`/`@Controller` 等）之上**（装饰器属类声明一部分，doc 放其前即附着类）。
- **成员 doc 落装饰器之上**：带 `@ApiProperty`/`@Expose` 的 DTO 属性，`/** */` 置于**装饰器行之前**（TypeDoc 读 `/**`，Swagger 读 `description`，各司其职、互不冲突）。
- **`fallow-ignore-next-line` 紧邻 `execute`**：抑制指令贴方法签名，`@param/@returns` 的 TSDoc 块置于**该指令之上**。
- **纯 re-export 文件**（`export type {...} from`）无自有符号 → 正常不产条目，**不是缺口**。

## 7. 转义与陷阱（`docs:api` 归零的关键）

| 陷阱 | 处置 |
|------|------|
| 注释内**裸 `@`**（`@core/*` 包名、`@Inject`/`@ApiProperty`/`@Can` 装饰器名）被当未知 block tag → `warning` | 用**反引号**包裹消解：`` `@core` ``；行首裸 `@` 尤其致命。 |
| 注释内**字面花括号** `{`/`}`（内联 JSON/对象例）被当 TSDoc 指令 | 转义 `\{`/`\}`，或改写为不含裸括号的表述。 |
| **跨文件裸名 `{@link Foo}`** 从当前 scope 解析失败 → `invalidLink` | 改为**代码跨度** `` `Foo`（说明） ``，或确保目标被文档化且可解析。 |
| `@internal` 想真隐藏 | 依赖 `excludeInternal:true`（配置 SSOT 在 `typedoc.json`），非注释层能保证。 |

## 8. 字段 / 属性注释

- **公开接口/类属性、enum 成员**：给 `/** 中文释义。 */`（行内单行即可）。
- **enum 成员逐个释义**（如 `OAuthProviderType` 各通道 → 「GitHub 社交登录通道」），成员名不自明时必注。
- **同名异义字段按容器语义精修**：`status` 在不同 DTO 分别是「租户生命周期状态 / 用户治理状态 / 订阅状态 / 退款状态」，不得泛化为「状态」；`id` 按容器落「文章 id / 账号 id / 会话 id」。
- **防噪音**：`id`/`createdAt`/`updatedAt`/`limit`/`offset`/`items`/`total` 等**本就准确**的通用字段，一行贴切释义即可（「创建时间」「每页数量上限」），不硬凑长文。

## 9. 验证门禁（改动注释后必跑）

书写纪律由以下**实证**兜底，非口头约定：

1. `pnpm run docs:api` → **EXIT=0 且 0 warning**（无 unknown-block-tag / invalidLink / unescaped-brace；warning 即回归）。
2. `pnpm run check`（Biome）→ EXIT=0。
3. `git diff` 须**纯注释**（非注释改动行应为空·证零行为）。
4. **覆盖度审计**用 **TypeScript AST** 遍历 `entryPoints` 范围（可靠穿越多行装饰器/空行），比对「导出符号 vs 产物成页」揪静默丢弃者。文本启发式不可信；可疑的全 0 结论**必须正向对照**（先证遍历确在跑：报出访问总数）再采信。
5. **禁止行号引用**（产物随改动漂移·只引符号名/文件路径）。

> `docs:api` 默认 **opt-in 不入 `ci`/pre-push** 链（来源方案裁点 ⓒ）；但改动对外注释后须**本地实跑归零**方可提交。

## 10. 与 OpenAPI/Swagger 的分工

- **本规范 → TypeDoc**：面向 **TS 码面 API 参考**（类型/函数/类的机器可解析文档）。
- **`@nestjs/swagger` → OpenAPI**：面向 **REST 运行时契约**（端点/DTO schema）。
- 两者**不同受众·并存不混**，产物经 GitHub Pages 合并发布（`/swagger/` + `/tsdoc/`·发布链见 `deploy-swagger.yml`，属高危#3 改 CI·须远端真跑对拍）。

## 11. 反过度注释（非目标·锁定）

- **不**给平凡 getter/setter、仅复述签名者可推知之物加注释（制造噪声）。
- **不**借注释之名改动 DI 形态 / schema / 路由 / 契约签名（纯注释、零行为）。
- **不**为凑覆盖度把自明字段写成水文，也不把「有意内部件」伪装成公开。

---

## 附：与既有文档的关系（防双 SSOT）

- 工具选型与命令 → `tooling-standards.md`（§2 TypeDoc 行 / §4.6 / §7）+ 实存 `typedoc.json`。
- 实施过程与逐切片裁决 → `plans/global-tsdoc-typedoc-docgen.md`（**历史快照·非书写依据**）。
- **本文件** = 「怎么写 TS 注释」的现行唯一书写依据；与上二者冲突时，**配置/产物事实优先**，再回改本文件留痕。
