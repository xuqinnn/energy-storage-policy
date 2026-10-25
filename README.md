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

## 研究方法

`#/methods`提供新写且独立审定的政策阅读/比较/资格核对方法；`#/methods/capacity-cost`区分容量时长参考折算、最终标准与年度实收，并列清充电费用与输配电费退减。服务范围见`#/services`。这些页面免费阅读，不整体放行历史方法卡、项目或企业数据。

## 容量与费用算术工具

`#/tools`可修改容量时长与四项充电费用的纯合成输入，浏览器本地计算。容量结果仅是参考折算部分，最终核价与年度实收不自动确认；退减为调用者声明，不自动决定资格。负电价、超当期输配金额的跨期退减不在简化接口内。可下载`examples/method-arithmetic.json`复核8组构造样例。

安装Node.js的环境可运行`node tests/test_storage_math.js`；测试只用Node标准库，与园区提供的独立8组构造结果逐例对拍，并验证分母0、非法数、缺项、超额退减等边界。网页使用不依赖Node、Python、数据库或求解服务。

园区固定合成演示见`#/park-demo`：8组24小时输入、可行调度、费用分项和守恒核对。仅切换预计算场景，不支持任意项目输入或在线LP。无发电时利用率为“不适用”；绿电利用率包含损耗，不等同政策自用比例。容量目标权重按整个24小时构造时段计，不是实际日价；运行费不是利润。

用Python标准库复现：`python tools/park_examples.py > /tmp/park-scenarios.json`。该脚本只构造8个固定算例；与JSON逐项对拍及物理约束核对见`python -m unittest discover -s tests`。无NumPy/SciPy、私有库或网络依赖。源代码MIT、构造数据CC0的范围见ASSETS.json和LICENSE-DATA.md，不给上游园区候选LP或历史资料整体授权。

### Work samples and evidence notes

Open `#/work` for three project samples. Each has a keyboard-accessible verification checklist, source/material links, limits and a Markdown download with its data version and snapshot time. The research note preserves the reviewed Chinese article; English framing does not translate the original policy. Synthetic examples link to the public reconstruction script and inputs. These notes contain no private originals and work in the offline single-file preview as well. Use code and data from the same snapshot when reproducing results; source availability may change.
