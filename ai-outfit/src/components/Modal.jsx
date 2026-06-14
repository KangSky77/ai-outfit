import { useEffect, useRef } from 'react'

// 배경 클릭 / × 버튼 / ESC 로 닫히는 범용 모달
export default function Modal({ onClose, children }) {
  const cardRef = useRef(null)

  useEffect(() => {
    const prevFocus = document.activeElement // 닫힐 때 포커스 복원용
    cardRef.current?.focus() // 열릴 때 포커스를 모달 안으로 이동 (접근성)

    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden' // 모달 뒤 배경 스크롤 방지

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prevFocus?.focus?.() // 원래 있던 곳으로 포커스 복원
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {/* 카드 내부 클릭은 닫힘으로 전파되지 않게 */}
      <div
        className="modal-card"
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="close">×</button>
        {children}
      </div>
    </div>
  )
}
