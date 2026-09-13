import { Link } from 'react-router-dom'
import { SITE_NAME, SITE_TAGLINE } from '../lib/site'

export default function Landing() {
  return (
    <section className="page page-landing">
      <h1>{SITE_NAME}</h1>
      <p className="page-lead">{SITE_TAGLINE}</p>
      <p>Landing 首页占位 — 完整内容由 T7 实现（产品介绍 / 亮点 / 隐私承诺 / Built with OPC 3.0）。</p>
      <Link className="btn btn-primary" to="/app">
        立即体验 →
      </Link>
    </section>
  )
}