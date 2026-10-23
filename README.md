# 独立能源研究站

面向储能开发、园区能源负责人和独立顾问的免费研究站。公共页面直接访问；咨询与定制是自愿的独立服务。项目不代表原任职企业。

沿用HTML/CSS/JavaScript与本地ECharts，无npm或后端。此仓库包含可编辑前台源码、Python标准库构建器、公开审定快照、合成样例和测试，不依赖私有xlsx、SQLite、个人路径或钥匙串。

## 本地运行

Python 3.10及以上：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

访问 http://127.0.0.1:8000/ 。直接打开file://会受浏览器fetch限制，请使用本地HTTP服务。

## 干净目录复现

```sh
python3 tools/build.py --input data/storage.json --out /tmp/energy-public
python3 -m unittest discover -s tests
python3 -m http.server 8001 --bind 127.0.0.1 --directory /tmp/energy-public
```

只用合成样例运行相同前台：

```sh
python3 tools/build.py --input examples/synthetic.json --out /tmp/energy-synthetic
python3 -m http.server 8002 --bind 127.0.0.1 --directory /tmp/energy-synthetic
```

输出目录必须为空；构建器不删除既有文件。构建输入/输出确定，BUILD.json逐项记录SHA；第三方库随仓库提供，无需下载才能构建。相同输入、源码得到相同输出。

## 数据和工具边界

当前发布政策/研究索引、短简述、审定专题与合成收益工具。旧企业测算、真实项目参数、未完成公开审定的旧分级和开发判断不从历史加密包直接搬到明文。合成工具展示输入、单位、公式与互斥条件；结果是运营差额，不是利润、IRR或投资建议。正式规则、征求稿与历史资料分别标状态。

已带官方发布页的条目可点开一手来源；研究资料提供独立摘要及元信息，不打包第三方原件。本轮没有强制账号、邮箱或第三方追踪脚本，流量与转化基线未知。

## 许可及贡献

代码MIT、合成样例CC0、自有研究解读CC BY 4.0；数据与第三方材料的范围见LICENSE-DATA.md及ASSETS.json，ECharts许可保留。此许可不覆盖历史工作库或原企业材料。

问题反馈：https://github.com/xuqinnn/energy-storage-policy/issues 。请勿上传客户数据、报价、联系人或未获授权的文档。自愿咨询：xuqinnn@163.com。发布由维护者核验后手动Push，再分别验证远端与实站。
