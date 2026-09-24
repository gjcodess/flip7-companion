import { AlertTriangle, X } from 'lucide-react'
import { motion } from 'motion/react'

type FieldWarningModalProps = {
  title: string
  message: string
  onClose: () => void
}

export function FieldWarningModal({ title, message, onClose }: FieldWarningModalProps) {
  return <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={onClose}>
    <motion.section className="card-picker home-prompt field-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="field-warning-title" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={(event) => event.stopPropagation()}>
      <div className="picker-heading">
        <div><span>CHECK THE FORM</span><h2 id="field-warning-title">{title}</h2></div>
        <button className="close-button" aria-label="Close warning" title="Close" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="field-warning-copy"><AlertTriangle size={20} aria-hidden="true" /><p>{message}</p></div>
      <div className="field-warning-actions"><button className="primary-wide" onClick={onClose}>Got it</button></div>
    </motion.section>
  </motion.div>
}
