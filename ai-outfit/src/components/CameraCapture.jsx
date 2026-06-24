import { useEffect, useRef, useState } from 'react'
import { dict } from '../i18n.js'

// OS 카메라 앱으로 나가지 않고 페이지 안에서 바로 촬영한다.
// (카메라 앱으로 전환하면 백그라운드의 PWA가 OS에 의해 종료되고, 돌아왔을 때
//  페이지가 새로 로드되며 촬영한 사진을 잃어버리는 문제를 원천적으로 피하기 위함)
export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(dict.cameraError)
      return
    }

    let active = true
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setError(dict.cameraError))

    return () => {
      active = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const handleShutter = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        onCapture(new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92
    )
  }

  return (
    <div className="camera-overlay">
      {error ? (
        <div className="camera-error">
          <p>{error}</p>
          <button type="button" onClick={onClose}>{dict.close}</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
          <button type="button" className="camera-close-btn" onClick={onClose} aria-label="close">×</button>
          <div className="camera-controls">
            <button
              type="button"
              className="camera-shutter-btn"
              onClick={handleShutter}
              aria-label={dict.takePhoto}
            />
          </div>
        </>
      )}
    </div>
  )
}
