import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function RoomCode({ code, showCopy = true, label = 'ROOM' }: { code: string; showCopy?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = code
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard access can be unavailable in an insecure local-network context.
    }
  }
  return <div className="room-code"><span>{label}</span><b>{code}</b>{showCopy && <button className="copy-room-code" aria-label={copied ? 'Room code copied' : 'Copy room code'} title={copied ? 'Copied' : 'Copy room code'} onClick={() => void copyCode()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>}</div>
}
