import { dict } from '../i18n.js'

// 0~100 코디 점수 배지 — conic-gradient 링으로 점수만큼 채워서 보여준다.
// 점수대별 색/한줄평으로 "공유하고 싶은 숫자"를 만드는 게 목적.
// 점수 없는 옛 기록(score === null)은 아무것도 그리지 않아 하위호환.
const grade = (score) => {
  if (score >= 85) return { color: '#4c9a67', label: dict.scoreGreat }
  if (score >= 70) return { color: '#b8963e', label: dict.scoreGood }
  if (score >= 50) return { color: '#c97f3c', label: dict.scoreOkay }
  return { color: '#c05b52', label: dict.scoreHmm }
}

export default function ScoreBadge({ score }) {
  if (score == null) return null
  const { color, label } = grade(score)
  return (
    <div
      className="score-badge"
      style={{ '--score-color': color, '--score-deg': `${score * 3.6}deg` }}
      role="img"
      aria-label={`${score}${dict.scoreUnit}`}
    >
      <div className="score-ring">
        <span className="score-number">{score}</span>
      </div>
      <span className="score-label">{label}</span>
    </div>
  )
}
