import { dict } from '../i18n.js'

// Web Share API(폰의 기본 공유 시트)로 분석 결과를 공유한다.
// 지원하지 않는 환경(주로 데스크탑)에서는 클립보드 복사로 폴백.
// 점수가 있으면 "오늘의 코디 점수 NN점!"을 앞에 붙여 공유 훅을 만든다.
export default function ShareButton({ text, score }) {
  const shareText = score != null
    ? `${dict.shareScorePrefix} ${score}${dict.scoreUnit}! 👕\n\n${text}`
    : text

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'AI Closet', text: shareText })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText)
        alert(dict.copied)
      }
    } catch {
      // 사용자가 공유를 취소한 경우 등은 무시
    }
  }

  return (
    <button className="share-btn" onClick={handleShare}>
      <span className="material-symbols-outlined">ios_share</span>
      {dict.share}
    </button>
  )
}
