// ❤️/🤍 좋아요 토글 버튼 — 기록 리스트(like-btn)와 갤러리 오버레이(like-overlay)에서 공용.
// 스타일은 className 으로 받아 두 화면의 기존 CSS 를 그대로 쓴다.
export default function LikeButton({ liked, likes, onClick, className }) {
  return (
    <button className={`${className} ${liked ? 'liked' : ''}`} onClick={onClick}>
      {liked ? '❤️' : '🤍'} <span>{likes ?? 0}</span>
    </button>
  )
}
