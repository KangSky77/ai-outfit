// AI 분석 결과(텍스트)를 섹션 단위로 파싱해서 보기 좋게 렌더링한다.
// Gemini가 형식을 안 지켜도 깨지지 않도록 최대한 관대하게 처리한다.

const EMOJI_START = /^\p{Extended_Pictographic}/u // 줄이 이모지로 시작하면 섹션 제목으로 간주
const BULLET = /^[-•*]\s+/                          // "- ", "• " 등은 목록 항목

function parseSections(text) {
  // 빈 줄 기준으로 블록 분리
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)

  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    let heading = null
    let body = lines

    if (lines.length > 0 && EMOJI_START.test(lines[0])) {
      heading = lines[0]
      body = lines.slice(1)
    }

    const items = body.filter((l) => BULLET.test(l)).map((l) => l.replace(BULLET, ''))
    const paras = body.filter((l) => !BULLET.test(l))
    return { heading, paras, items }
  })
}

export default function AnalysisResult({ text }) {
  const sections = parseSections(text || '')

  return (
    <div className="analysis">
      {sections.map((s, i) => (
        <div className="result-section" key={i}>
          {s.heading && <div className="result-section-title">{s.heading}</div>}
          {s.paras.map((p, j) => <p key={j}>{p}</p>)}
          {s.items.length > 0 && (
            <ul>
              {s.items.map((it, j) => <li key={j}>{it}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
