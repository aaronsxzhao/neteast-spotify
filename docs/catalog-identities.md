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
