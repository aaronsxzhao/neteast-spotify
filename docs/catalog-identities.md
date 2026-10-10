# 2026-09-20 身份核验与匹配边界

这里只记录公开曲目元数据与身份依据，不包含账号、Cookie、令牌或密钥。公开页面存在不代表当前账号所在地区可播放；每次真实同步仍经过 Spotify 可播放性与匹配检查。

## 可跨歌曲复用的艺人对应

| 网易显示名 | 其他显示名 | 依据 |
|---|---|---|
| 柴田淳 | Jun Shibata | [艺人官网](https://www.shibajun.jp/) |
| 青山テルマ | Thelma Aoyama | [艺人官方介绍](https://thelma.jp/biography/) |
| 岩崎太整 | Taisei Iwasaki | [艺人官网作品公告](https://taisei-iwasaki.com/information/2019/07/23/141) |
| 八神純子 | Junko Yagami | [Spotify 正式发行专辑](https://open.spotify.com/album/3t5gc5CkMsQbM4rViqYsk3) |
| 邓丽君／鄧麗君 | Teresa Teng／テレサ・テン | [唱片公司介绍](https://www.universal-music.co.jp/teresa-teng/biography/) |
| 沈圭善／심규선 | Lucia | [艺人官方频道](https://www.youtube.com/watch?v=ywbUSApIp-A)、网易源署名及 [Spotify 曲目](https://open.spotify.com/track/0eEY0apvGDmp9EjrLSkZt5) |

艺人映射双向使用；人工歌名翻译仍限制到源歌曲 ID、原名及主艺人，不能扩散到所有同名歌曲。

## 限定源歌曲的标题对应

- `2099327170`，SHAUN《여름에 두었다》→《That Summer》：[艺人官方视频](https://www.youtube.com/watch?v=39vKFcMdW9Q)、[Spotify 单曲](https://open.spotify.com/album/6aFIFxsveiaKU30g2wiItW)。
- `3313987952`，《ハローミューズ》→《Hello Muse》：[Spotify 日文发行](https://open.spotify.com/track/1NDfpOvD7nntE3lNYolCI8)、[Apple Music 英文发行](https://music.apple.com/us/song/1849824879)；已保存 Spotify 候选的专辑与时长均吻合，CV 名单完整对应佐藤日向、小泉萌香。
- `36307466`，沈圭善《달과 6펜스》→《The Moon and Sixpence》：[Spotify 双语曲目页](https://open.spotify.com/track/0eEY0apvGDmp9EjrLSkZt5)。

## 通用规则与不自动推断的情况

- `角色(CV:声优)` 只在完整演唱名单、一致标题与专辑、2.5 秒内时长证据共同满足时识别；不把不同角色、部分组合或伴奏自动等同原唱。
- 单个跨文字斜杠署名可在相同录音证据下匹配其完整分段；同文字的 `AC/DC`、多艺人名单和普通组合名称不拆为身份别名。
- 角括号版本标签进入同歌同主要艺人的替代版本复核，普通副标题仍参与身份判断；不同歌手不能借版本规则混入。
- `Richz` 与 `DJ Richz`、`许斐` 与 `Wy`、`音权` 与 `DonixFloW`、`Trispect/Kyrex` 与 `DJchina` 尚无可靠身份对应，不加入别名表。相同标题或毫秒级时长不能单独证明艺人相同。
- 这些未知身份在专门检索与版本复核后保留 `identityReviewRequired`，不继续执行最后的关键词排列补查。仍保存有限候选和查询诊断，以便后续核验。

`test/daily-september20.test.js` 使用离线元数据与模拟返回测试上述规则。它证明规则行为，不证明真实搜索必定返回这些候选，也不是同步成功率承诺。

## 2026-09-21：连写署名、版本别名与无效补查

当天首次同步 23/33，实际 Spotify 请求 210 次；10 首未匹配共消耗 155 次逻辑目录查询。已保存候选中，《昔語りふたりぼっち》《I OWN,I KNOW》《PIECE OF MY WISH》已有相符候选，问题分别是标题翻译、连写双语署名、已知艺人外文名缺失。不能把这些情况解释成 Spotify 没有歌曲。

- `田冰冰TIBIBI` 一类无分隔符双语署名：分段先用于检索，不直接充当全局艺人别名。只有源和目标均为单个署名、完整分段相等、标题及专辑高度相符、时长差不超过 2.5 秒时，才允许录音级身份佐证。多艺人、组合片段、其他专辑及不同版本不享受这个例外。双语专辑使用现有括号翻译拆分规则比较。
- `女声版`、`女生版`、`伴奏` 等单独版本说明不再当作翻译歌名；实际歌曲名称始终保留。
- 最后的预算回收补查共享连续两次无新证据的停止条件，不再每换一种查询语法重置。各专门检索阶段仍保留机会；完全零候选时保留尚未执行的查询，以免损伤检索召回。总上限仍为 18 次逻辑目录查询，HTTP 节流及 429 冷却规则不变。
- 源歌曲限定的目录 ID 必须重新获取并经过正常身份、版本与可播放性检查。已核验的翻译可以直接用于校验该返回结果，无需重走重复搜索。

新增核验依据：

| 对应关系 | 依据及作用域 |
|---|---|
| 今井美樹 → Miki Imai / mikiimai | [艺人官网](https://www.imai-miki.net/)、[Spotify 发行](https://open.spotify.com/track/7ol2N6z1U6AHbWzfW3Lpiq)、当天保存的同曲候选；艺人拼写可复用 |
| `3313987317` 昔語りふたりぼっち → Our Old Tale | [官方日文曲序及完整 CV 名单](https://revuestarlight.com/music/acte-zero/)、[Apple Music 英文发行](https://music.apple.com/us/song/1849824876)、当天 Spotify 候选；限定源 ID、原名及主艺人，伴奏仍拒绝 |
| `759622` よる☆かぜ → yorukaze | [Spotify 双语曲目页](https://open.spotify.com/intl-ja/track/2b3bDmj7kUKXtkYSaJdPmZ)；限定源歌曲，并增加目录检索指针 |
| `26123720` 無人の島：TRUE → Miho Karasawa / 唐沢美帆 | [艺人官方身份说明](https://true-singer.com/contents/417470)、[Spotify 曲目页](https://open.spotify.com/track/02OjX2aaE5EAyveeluFR2B)；TRUE 是易重名的显示名，因此只增加该源歌曲的受限署名和目录指针，不建立所有 TRUE 的全局别名 |

新增 `test/daily-september21.test.js` 覆盖以上正常及拒绝路径。公开指针和离线回放不代表真实同步已成功，结果以云端补跑为准。

## 2026-09-22：合作署名、版本标签与原唱选择

当天 33 首全部处理完，匹配 19 首，Spotify 请求 238 次，无冷却；14 首未匹配共用了 193 次逻辑目录查询。更新不增加请求预算、不改调度或自动重跑策略。

通用规则调整：

- `With ...` 后缀：两边标题明确写出相同的完整合作名单（包括核验过的跨语言名字）时，两边统一移除后缀参与标题比较。若只有一边写出后缀，仍要求该平台的结构化艺人名单能证明合作署名。不会无条件删除 `with` 子标题，也不会用共同嘉宾代替主艺人身份。
- 识别 `～Album Version～`、`~Single Ver.~` 等完整版本标签，以及限定范围内的 `Album Verion` 拼写错误。普通波浪线副标题不删除；WANDS 第 5 期版本进入同主艺人的替代版本流程，不冒充原录音，也不接受仅有 WANDS 嘉宾署名的另一首发行。
- `less vocal`、`off vocal`、`ボーカルレス` 纳入伴奏识别。即使同艺人、同长度，也不能通过替代版本模式把伴奏替换有演唱的歌曲；本身就是伴奏的源曲仍可匹配对应伴奏。
- 同分的合格候选按时长接近程度选择，保留原有歧义检查；不因时长接近就接受另一位艺人的翻唱。

核验过的对应（仍不是自动翻译任意歌曲）：

| 对应 | 依据及范围 |
|---|---|
| 平井堅 → Ken Hirai | [Sony Music 官方艺人页](https://www.sonymusic.co.jp/artist/KenHirai/)；艺人对应可跨歌曲复用，阻止 BENI 翻唱参与原唱选择 |
| 孝敏／효민 → Hyomin；로꼬 → Loco | [Spotify 合作发行](https://open.spotify.com/track/4gcmhFCfvulg76xrz7Uqnr)、[Spotify 双语署名](https://open.spotify.com/embed?uri=spotify%3Atrack%3A2FXKtreeU7nH5zeN94pk4O&view=coverart)、网易源元数据；艺人对应可复用 |
| `1442021148` 東京フラッシュ → Tokyo Flash | [Vaundy 官网](https://vaundy.jp/feature/biography)、[Spotify 单曲](https://open.spotify.com/intl-ja/track/6Dwv4HI2oLXiyqDDiV8MKT)；限定源 ID、歌名、主艺人 |
| `1416378346` 아무노래 → Any song | [ZICO 官方双语音源](https://www.youtube.com/watch?v=GOtF5_Ow0_Y)、[Spotify 专辑](https://open.spotify.com/embed/album/7LYZM7I172wUjIKjCnxuAQ)；限定源 ID、歌名、主艺人 |
| `22842404` TV를 껐네... → I turned off the TV... | [Spotify 正式发行](https://open.spotify.com/track/38srLCqsLKdlpEaCrEibvm)、当天同专辑同时长的保存候选；限定源 ID、歌名、主艺人 |

`test/daily-september22.test.js` 覆盖正常召回、未证实署名、嘉宾误匹配、伴奏误匹配、普通副标题、预算和去重。更新后离线回放保存候选可恢复 4 首（平井堅、WANDS、Leessang、Hyomin），原有 19 首仍通过；Vaundy 与 ZICO 只有模拟检索测试，尚未实测召回。此更新没有发起同步，不能把离线结果计入 Spotify 歌单数量。

## 2026-09-23：闭合双语标题、原专辑优先与混音边界

当天首次同步 23/33，Spotify 请求 183 次，无 429。本次调整不增加请求预算、不降低请求间隔，不改变调度、歌单名称及用户封面。

- 识别 `Kissしたい -WANNA KISS- (2021 Remaster)` 一类闭合破折号双语标题：原名保留，同时将本地文字标题及英文标题提前用于查询和校验。本地标题可以包含拉丁字母，但另一侧必须是非版本说明的拉丁文字；不拆普通英文副标题、未闭合标签、现场/混音说明，也不把这种规则扩散为艺人别名。
- 同一完整艺人名单、相同录音标题/类型的再版竞争时，原专辑完全一致且时长差不超过 250 毫秒的候选，可以优于专辑不完全一致、时长差不超过 2.5 秒的候选。相同专辑证据的歧义仍保留，不把不同嘉宾、现场版本或未知艺人视为同一录音。
- 完整的 `after hours mix`、`club mix` 等有限混音标签进入同曲同主艺人的替代版本复核，并标记替代版本。`instrument mix` 归为伴奏，不能替代原演唱；不会删除任意包含 mix 的普通副标题。

| 已核验对应 | 依据及范围 |
|---|---|
| 中森明菜 → Akina Nakamori | [Warner 官方专题](https://sp.wmg.jp/akinanakamori/)；可跨歌曲复用 |
| 当山ひとみ → Hitomi Tohyama | [Columbia 官方发行](https://columbia.jp/artist-info/tohyamahitomi/discography/COCP-42211-2.html)、[SEXY ROBOT 曲目表](https://columbia.jp/artist-info/tohyamahitomi/discography/COKM-43424.html)；可跨歌曲复用，Wanna Kiss 从双语原名拆分，不新增人工歌名翻译 |
| 中原めいこ → Meiko Nakahara | [Universal 官方发行](https://www.universal-music.co.jp/p/TOCT-10977/)；可跨歌曲复用，仍拒绝纯伴奏 |
| `22655497` CAGNET《Deeper and Deeper》目录指针 | [Spotify 正式曲目](https://open.spotify.com/track/5ElzKkLs6ZQ1Sp2YEkzHm9)；限定源 ID、原名及主艺人，实际运行仍重新获取并检查账号地区可播放性和匹配证据 |

`test/daily-september23.test.js` 覆盖正确召回及误匹配拒绝。离线回放今天保存的候选预览可恢复中森明菜、当山ひとみ和中原めいこ（after hours mix）3 首；原有 23 首仍通过。CAGNET 指针只有模拟测试，真实补跑结果另行确认；离线回放不等于线上已成功。

## 2026-10-10：最近三天回放、检索机会与身份补全

云端最终快照：10 月 8 日 21/32、9 日 26/32、10 日 25/32，共 24 个未匹配案例。10 月 8 日早间一次任务在匹配阶段记录 HTTP 500，后续恢复并成功写入；这与最终未匹配的身份/检索问题分开处理。10 月 10 日后续任务是 `already-synced` 跳过，不是同步再次失败。

### 通用调整

- 专辑的显式 `tns/alia` 名称先于首名称的繁简、短标题和卷号变体分配查询机会；专辑查询仍最多两种，不额外增加遍历预算。
- 人工别名阶段的前两个查询机会优先分配给新的已核验标题和主艺人别名，避免重复的原名语法抢占位置。仍先走原始元数据、标题、自由文本、专辑策略；不会提前使用任意人工标题翻译。
- 同艺人、近似时长但标题不同的候选增加 `title-translation-unconfirmed` 诊断，提示需要核验译名，不把同时长当成标题相同的证明。
- 每首总上限仍为 18 次逻辑目录查询，查询去重、停滞停止、HTTP 请求间隔、全局预算、429 冷却、每日调度均未改变。不修改歌单标题或封面。

### 已核验对应

| 对应 | 依据及范围 |
|---|---|
| クラムボン → clammbon | [Columbia 官方艺人页](https://columbia.jp/artist-info/clammbon/live/)、[官方发行音源](https://www.youtube.com/watch?v=kfvZZKm3gA0)；艺人对应可跨歌复用 |
| ラムジ → Lambsey | [双语发行信息 AVCD-30954](https://www.cdjapan.co.jp/product/AVCD-30954)、[流媒体曲目与作者署名](https://www.shazam.com/song/157176659/planet)；艺人对应，不代表账号地区可播放 |
| 陈奕迅 → Eason Chan | [Universal 官方艺人名单](https://www.universalmusic.com/universal-music-group-announces-strategic-expansion-and-frontline-label-launches-within-china/)；主艺人对应，不凭相同嘉宾匹配 |
| 椎名林檎 → Sheena Ringo | [Universal 双语发行页](https://www.universal-music.co.jp/sheena-ringo/products/tyct-30027/) |
| 温岚 → Landy Wen | [演出主办方公开文件](https://www.unusual.com.sg/assets/4127969e94/UnUsUaL_Offer_Document_3_April_2017_Final.pdf)、同曲保存候选 |
| 小田和正 → Kazumasa Oda | [艺人官方介绍](https://kazumasaoda.site/kazumasaoda/profile/)；拒绝 Night Tempo / ELAIZA 翻唱参与原唱选择 |
| 竹内まりや → Mariya Takeuchi | [Warner 官方艺人及发行页](https://wmg.jp/mariya/)；《駅》不再与 Akina Nakamori 同时长版本混淆 |
| 松原みき → Miki Matsubara | [Pony Canyon 双语官方公告](https://news.ponycanyon.co.jp/2024/12/106435)；不能把 EIKO / Ms.OOJA 翻唱当成原唱 |
| `3327545535` 言伝 → Kotozute | [官方原名与发行日期](https://bialystocks.com/discography/)、[Spotify 曲目](https://open.spotify.com/track/0xMkAsZxwq6TRmZWFORNVz)、已保存 Bialystocks 同艺人且时长 275925 ms 候选；限定源 ID、原名、主艺人 |

### 验证结果与局限

`test/daily-october10.test.js` 覆盖身份对应、嘉宾误匹配、相似时长翻唱、不可播放、源 ID 限定、替代版本、译名查询机会及预算。

仅回放各未匹配记录保存的前五个候选，可修正 7 个案例：10 月 8 日《可一可再》《意識》《蓝色雨》《ラブ・ストーリーは突然に》；9 日《駅》；10 日《言伝》《波よせて》。三天原有 72 个成功结果重新评分均仍通过。此处不是线上成功率，也没有写入 Spotify。

《PLANET》新增艺人检索路径只有模拟召回测试，保存候选中没有 Lambsey，不能计入恢复数量。其余未确认身份、未找到合格候选的歌仍待核验；CAGNET 已知录音被标记不可播放，不绕过可播放性检查。公开曲目链接和离线回放都不保证当前账号地区可听。

## 2026-10-10：剩余案例的第二轮修复

本轮针对上一轮剩下的 17 个案例中的 7 个有证据目标，不把未找到公开发行的其余歌曲视为“不存在”。没有放宽全局标题、艺人、时长阈值。

### 通用修复

- 查询清理支持 `feat.윤미래`、`feat.Gary`、`ft.Gary` 等句点后无空格的合作署名；只处理独立、带分隔符的署名，不截断 `Defeat` / `Features` 等普通标题。
- 当标题和主艺人都有已核验的新名称时，人工别名阶段的第一个机会组合两边的新名称，避免分别搭配旧名称一直查不到。仍在现有阶段和 18 次逻辑目录查询上限内。
- `(inst)`、`(Inst.)`、`[INST]`、全角括号和破折号后缀纳入伴奏检测；严格匹配和替代版本都不能用伴奏替代演唱。源歌曲本来是伴奏时仍可匹配伴奏。
- 已核验的源歌曲目录 ID 复用现有单次获取路径：仍重新获取、检查可播放性并评分。该 ID 意外返回其他署名时，不允许仅凭跨文字、同标题和近似时长接受；不可播放或缺失时继续有限的正常检索，不绕过 429。

### 受限目录指针与名称证据

| 源歌曲 ID | 对应及证据 |
|---|---|
| `29709498` 고장난 선풍기 / MC 몽 | [Broken fan / MC MONG](https://open.spotify.com/track/6kwsi5SsN9zjeSDQvNTrnj)，保存候选专辑相同、时长均为 257488 ms；主艺人别名可复用，译名仅限该源 ID、原名和主艺人 |
| `28590221` 이젠 너 없이도 / EUNA KIM | [Without you now](https://open.spotify.com/track/3qR4sYUDzIfYXwVkUusi8H)、[1theK 官方双语 MV](https://www.youtube.com/watch?v=VTXbTKnuUn4)，保存候选专辑相同、时长均为 217120 ms；译名受源身份限制，明确排除同专辑伴奏 |
| `3399839173` 甲乙丙丁 (你我怎么两清) / 李佳薇 | [甲乙丙丁Strangers / Jess Lee](https://open.spotify.com/track/629FqLOdjtsXh5b45FTk43)；艺人别名可复用，连写标题限定源歌曲，不全局拆除中文副标题或粤语版说明 |
| `812400` PLANET / ラムジ | [Spotify 3ラムジ 专辑](https://open.spotify.com/album/1eesvAth8KUYdHRPDJRHSN)、[演唱曲目](https://open.spotify.com/track/5Zy4OB1HiZA1FSpoOKKfPo)；Spotify 艺人显示为 **Labmsey**，补充到已有 Lambsey 对应中，不指向同专辑 Instrumental |
| `2012146052` 真夜中のドア/Stay With Me / 松原みき | [Miki Matsubara 原唱发行](https://open.spotify.com/track/5DCLkzuWICNar6qn3B393f)，使用已有艺人别名；不接受 EIKO 等翻唱 |
| `85571` 我们俩 / 郭顶 | [微微专辑曲目](https://open.spotify.com/track/3adCRGhoyecriPYS7mAwIz)，不新增歌名或艺人翻译 |
| `22722696` 空を見上げて / 河合その子 | [sonnet 收录版本](https://open.spotify.com/track/1U8vzpsCm1ImJogHMheScv)，使用现有同歌同艺人、允许不同收录专辑的规则 |

### 离线验证，不是线上同步结果

`test/daily-october10-remaining.test.js` 覆盖七个目标的模拟直接获取、正常搜索回退、源身份约束、不可播放、错误艺人、粤语副标题、伴奏及预算。公开页面的分钟秒数只用于近似时长测试，不冒充 API 精确值。

三天原先 24 个未匹配案例的保存候选回放，累计可恢复 9 个（上一轮 7 个 + 本轮两首韩文译名曲目）；原有 72 个成功结果仍全部通过。另五个公开目录目标只有模拟召回验证，实际可播放性和导入结果需后续云端同步确认。本轮不修改调度、HTTP 节流、全局预算、歌单名称或封面。
