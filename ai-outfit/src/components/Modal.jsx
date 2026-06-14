import { useEffect } from 'react'

// 배경 클릭 / × 버튼 / ESC 로 닫히는 범용 모달
export default function Modal({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden' // 모달 뒤 배경 스크롤 방지
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {/* 카드 내부 클릭은 닫힘으로 전파되지 않게 */}
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="close">×</button>
        {children}
      </div>
    </div>
  )
}
