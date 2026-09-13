// Export guide for Google Timeline data: step-by-step Android / iOS paths,
// old vs new file format comparison and an FAQ accordion.
import { Link } from 'react-router-dom'
import FAQ from '../components/FAQ'
import type { FAQItem } from '../components/FAQ'

const ANDROID_STEPS = [
  '打开手机「设置」',
  '进入「位置」',
  '点「位置服务」',
  '找到「时间轴」，点「导出时间轴数据」',
  '选择要导出的 Google 账号与日期范围',
  '等待生成，得到一份 Timeline JSON 文件（建议存到你能找到的位置，如「文件」或「下载」）',
]

const IOS_STEPS = [
  '打开 Google Maps App',
  '点击右上角的头像',
  '进入「设置」',
  '选「个人内容」/「位置和隐私」',
  '点「导出时间轴数据」，选择日期范围与账号',
  '生成的 JSON 会存入「文件」App，稍后直接从「文件」里选它导入本工具',
]

const FAQ_ITEMS: FAQItem[] = [
  {
    q: '找不到「时间轴」菜单？',
    a: '时间轴入口藏得比较深：Android 在「设置 → 位置 → 位置服务 → 时间轴」，iOS 在 Google Maps App 的「头像 → 设置 → 个人内容 / 位置和隐私」。不同系统版本、机型或语言，叫法可能略有差异，可直接在设置里搜索「Timeline / 时间轴 / 导出时间轴数据」。如果账号里完全没有位置记录，说明这个账号从未开启过位置记录。',
  },
  {
    q: '换了新手机，旧手机的时间轴没了？',
    a: '位置记录跟随你的 Google 账号，原则上与手机无关；但换机后偶尔会遇到「时间轴暂时不可用」，通常是因为没有开启加密备份。在时间轴设置里打开「加密时间轴备份」，等待旧数据恢复后再导出。恢复前后的文件可以一起导入本工具，互不冲突。',
  },
  {
    q: '导出的文件特别大？',
    a: '很正常。位置记录经年累月累积下来可达几百 MB，文件大说明你的数据足够完整。本工具全部在浏览器本地解析，不占网络流量，也不会上传。文件太大时，可以只导出近一个月 / 近一年，或分时段多次导出后一次性导入。',
  },
  {
    q: '数据安全吗？',
    a: '安全。所有解析与查询都在你浏览器的内存中进行：不写入 localStorage / IndexedDB，不上传任何服务器，刷新页面即清空，关掉标签页即彻底消失。唯一可能发出的外部请求是地图瓦片（默认 OpenStreetMap），它只会发送你的 IP 与当前地图视野坐标。',
  },
]

export default function HelpPage() {
  return (
    <section className="page page-help">
      <h1>如何导出 Google Timeline 位置历史</h1>
      <p className="help-lead">
        位置历史最初只存在 Google 的服务器上，网页版关停后，只能先在手机上把数据「导出」成 JSON，
        再用本工具导入还原成地图。以下步骤基于 Google 的实际界面整理。
      </p>

      <section className="help-section">
        <h2>Android：藏在系统设置里</h2>
        <p className="help-hint">位置历史的功能入口在系统设置里，而不是某个 App 中。</p>
        <ol className="step-cards">
          {ANDROID_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="help-tip">
          提示：具体路径会因机型、系统版本与语言略有差异。关键链路是「位置」→「位置服务」→「时间轴」→
          「导出时间轴数据」，找不到就在系统设置里搜索「时间轴」。
        </p>
        <pre className="code-block">
          <code>{'下载的文件：\nTimeline.json'}</code>
        </pre>
      </section>

      <section className="help-section">
        <h2>iOS：在 Google Maps App 内导出</h2>
        <p className="help-hint">需要已安装 Google Maps App，且登录了开启位置记录的账号。</p>
        <ol className="step-cards">
          {IOS_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="help-tip">
          提示：导出的 JSON 会以「文件」App 里的文件形式保存，之后在本工具里从「文件」直接选择即可导入。
        </p>
        <pre className="code-block">
          <code>{'iPad 或 iPhone 上的文件路径示例：\n文件 App / 我的 iPhone / 下载 / Timeline.json'}</code>
        </pre>
      </section>

      <section className="help-section">
        <h2>新旧格式说明：这四种本工具都支持</h2>
        <p className="help-hint">无论导出时间先后，你手上的文件是下列哪一种，都能直接导入。</p>
        <div className="format-rows">
          <div className="format-row">
            <code>Timeline.json</code>
            <span>手机系统设置 / Maps App 直接导出（新版，semanticSegments 结构）</span>
          </div>
          <div className="format-row">
            <code>Records.json</code>
            <span>Google Takeout 导出（locations + activitySegments）</span>
          </div>
          <div className="format-row">
            <code>YYYY_MM.json</code>
            <span>Takeout 的 Semantic Location History，按月存放（placeVisit / activitySegment）</span>
          </div>
          <div className="format-row">
            <code>Location History.json</code>
            <span>旧版 Takeout 导出（较早期格式）</span>
          </div>
        </div>
        <pre className="code-block">
          <code>{`Timeline.json                          ← 手机端直接导出（新版，推荐）
Takeout/Location History/Records.json               ← Takeout（较新）
Takeout/Semantic Location History/YYYY_MM.json      ← Takeout（按月）
Takeout/Location History/Location History.json      ← Takeout（旧版）`}</code>
        </pre>
        <p className="help-tip">
          如果有多个文件（比如按月导出了好几份），可以一次性全选、合并导入。
        </p>
      </section>

      <section className="help-section">
        <h2>常见问题</h2>
        <FAQ items={FAQ_ITEMS} />
      </section>

      <div className="help-cta">
        <Link className="btn btn-primary btn-lg" to="/">
          回到首页，一键体验示例数据 →
        </Link>
      </div>
    </section>
  )
}