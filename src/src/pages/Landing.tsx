// Portfolio landing page: hero with dual CTA, the "why" story, three feature
// highlights, tech stack + tutorial entry + privacy promise, and the
// "Built with OPC 3.0" section telling how the product was shaped by an
// AI-driven product flow.
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { OPC_3_LINK, SITE_NAME } from '../lib/site'
import { useTimelineStore } from '../store/timelineStore'

export default function Landing() {
  const loadSample = useTimelineStore((state) => state.loadSample)
  const status = useTimelineStore((state) => state.status)
  const { hash } = useLocation()
  const busy = status === 'parsing'

  // When reached via the footer link ("Created by OPC 3.0") from another page,
  // the router remounts this page after load, so native fragment scrolling may
  // miss the target; scroll to the section explicitly instead.
  useEffect(() => {
    if (hash === '#built-with-opc') {
      document.getElementById('built-with-opc')?.scrollIntoView({ block: 'start' })
    }
  }, [hash])

  // loadSample itself navigates to /app on success, so no extra navigate call
  // is needed here (avoids a double redirect).
  const handleTryIt = () => {
    void loadSample()
  }

  return (
    <section className="page page-landing">
      <div className="landing-hero">
        <p className="empty-eyebrow">{SITE_NAME}</p>
        <h1>把 Google Timeline 数据从 JSON 变回你的行程地图</h1>
        <p className="hero-lead">
          Google 停用 Timeline 网页版之后，多年的位置历史只剩一份裸 JSON。
          导入本工具，回放每一段行程、点击地图查看每个位置的历史——全部在浏览器本地完成，数据不出设备。
        </p>
        <div className="hero-cta">
          <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={handleTryIt}>
            {busy ? '载入中…' : '立即体验'}
          </button>
          <Link className="btn btn-secondary btn-lg" to="/help">
            如何导出数据
          </Link>
        </div>
        <p className="hero-note">无需注册 · 无需账号 · 可一键载入模拟数据试玩</p>
      </div>

      <div className="landing-section">
        <h2>网页版关停之后，历史「看不见」了</h2>
        <p className="landing-text">
          Google 已停止支持 Timeline 网页版，你多年的行程历史被塞进手机里；手机能导出的，
          又是一份只适合机器读、人根本看不懂的裸 JSON。本工具把这些数据还原成一张
          会讲故事的行程地图——轨迹、停留、时间线，一眼找回。
        </p>
      </div>

      <div className="landing-section">
        <h2>三个能力，覆盖你的整段位置历史</h2>
        <div className="feature-cards">
          <div className="feature-card">
            <p className="fc-tag">Trips</p>
            <h3>行程回放</h3>
            <p>按日期范围绘制出行路线与停留点，交通方式一眼区分——回看那一天你走过哪、停在哪、待了多久。</p>
          </div>
          <div className="feature-card">
            <p className="fc-tag">Places</p>
            <h3>点击地图，查访历史</h3>
            <p>地图上任意点一下，1–100KM 半径内自动列出所有历史停留点——哪个商圈、到过哪些地方，一次看个明白。</p>
          </div>
          <div className="feature-card">
            <p className="fc-tag">Privacy</p>
            <h3>数据不出设备</h3>
            <p>解析与查询全部在浏览器内存中完成，刷新即弃。无后端、无账号、无统计 SDK，你的坐标只属于你自己。</p>
          </div>
        </div>
      </div>

      <div className="landing-section">
        <h2>本地优先的纯粹前端工具</h2>
        <p className="tech-line">React · TypeScript · Vite · Leaflet · Web Worker · Zustand</p>
        <p className="landing-text">
          想知道你的位置历史怎么导出？<Link to="/help">查看 Android / iOS 导出教程 →</Link>
        </p>
        <p className="privacy-promise">
          隐私承诺：位置数据是最敏感的个人信息。本工具不设服务器、不收集任何统计，你的坐标只出现在
          自己的浏览器里——关掉标签页，即彻底消失。
        </p>
      </div>

      <section id="built-with-opc" className="landing-section landing-builtwith">
        <h2>Built with OPC 3.0</h2>
        <p className="landing-text">
          这个产品不是一次性写完的，而是顺着一条文档驱动的产品流程逐步成型：
          需求脑暴 → 方案（产品需求文档）→ 任务拆解 → 开发实现 → 代码审查 → 逐条验收，
          每一步都留有记录，可回溯。让一个人也能像一个小团队一样，把一件事从头带到交付。
        </p>
        <ol className="opc-steps">
          <li><strong>需求</strong>脑暴与方向拍板</li>
          <li><strong>方案</strong>产品需求文档</li>
          <li><strong>开发</strong>任务拆解与实现</li>
          <li><strong>审查</strong>代码检查与把关</li>
          <li><strong>验收</strong>对照需求逐条确认</li>
        </ol>
        <p className="landing-text">
          OPC 3.0 是一套轻量的「一人公司 AI 团队」工作流：用 AI 协作角色 + 文档驱动的流程，
          帮你把产品从想法做到落地。{` `}
          <a href={OPC_3_LINK}>了解更多 →</a>
        </p>
      </section>
    </section>
  )
}