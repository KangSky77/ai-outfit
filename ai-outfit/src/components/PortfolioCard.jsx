import { useState } from 'react'
import { dict } from '../i18n.js'

// 발표/포트폴리오용 "개발 이야기" 토글 카드
export default function PortfolioCard() {
  const [open, setOpen] = useState(false)

  return (
    <div className="portfolio-wrap">
      <button className="portfolio-toggle" onClick={() => setOpen((o) => !o)}>
        💻 {open ? dict.portfolioHide : dict.portfolioShow}
      </button>

      {open && (
        <div className="portfolio-card">
          <h3>💻 Project: AI Closet Advisor</h3>
          <p>
            인천폴리텍 컴공과 강하늘의 복학 후 첫 프로젝트입니다.
            13년 된 구형 펜티엄 G2130 데스크탑을 리눅스 서버로 개조하여 구축했습니다.
          </p>
          <div className="tech-tags">
            <span className="tech-tag">Linux</span>
            <span className="tech-tag">Node.js</span>
            <span className="tech-tag">React</span>
            <span className="tech-tag">SQLite3</span>
            <span className="tech-tag">Gemini AI</span>
            <span className="tech-tag">Nginx</span>
          </div>
        </div>
      )}
    </div>
  )
}
