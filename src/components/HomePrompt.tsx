import { motion } from 'motion/react'
import { X } from 'lucide-react'

export function HomePrompt({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={onCancel}><motion.section className="card-picker home-prompt" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>LEAVE THIS VIEW</span><h2>Go to home?</h2></div><button className="close-button" aria-label="Close" title="Close" onClick={onCancel}><X size={19} /></button></div><p className="home-prompt-copy">You can return to the room from the home screen at any time.</p><div className="home-prompt-actions"><button className="secondary-action" onClick={onCancel}>Stay here</button><button className="primary-wide" onClick={onConfirm}><span className="button-content">Go to home</span></button></div></motion.section></motion.div>
}
