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
