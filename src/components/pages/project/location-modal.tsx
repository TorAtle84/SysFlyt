"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FileText, Map, Box } from "lucide-react"

interface LinkedDoc {
    docId: string
    page: number
    x: number
    y: number
    docTitle: string
    docType: "DRAWING" | "SCHEMA" | "MASSLIST" | "OTHER"
}

interface LinkedModel {
    modelId: string
    modelName: string
    fullTag: string
}

interface LocationModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    documents: LinkedDoc[]
    models?: LinkedModel[]
    project: { id: string }
    componentName: string
    onDocumentSelect?: (doc: LinkedDoc) => void
    onModelSelect?: (model: LinkedModel) => void
}

export function LocationModal({ open, onOpenChange, documents, models = [], project, componentName, onDocumentSelect, onModelSelect }: LocationModalProps) {

    // Group by type
    const drawings = documents.filter(d => d.docType === "DRAWING")
    const schemas = documents.filter(d => d.docType === "SCHEMA")
    const linkedModels = models

    const handleOpen = (doc: LinkedDoc) => {
        if (onDocumentSelect) {
            onDocumentSelect(doc)
        } else {
            // Use the correct route: /projects/[id]/documents/[docId]
            // Add query params for deep linking
            const url = `/projects/${project.id}/documents/${doc.docId}?page=${doc.page}&highlight=${componentName}` /* &x=${doc.x}&y=${doc.y} */
            window.open(url, '_blank')
        }
        onOpenChange(false)
    }

    const handleOpenModel = (m: LinkedModel) => {
        if (onModelSelect) {
            onModelSelect(m)
        } else {
            // Fallback: open the model page (viewer selection handled there)
            const url = `/projects/${project.id}/models?tag=${encodeURIComponent(m.fullTag)}`
            window.open(url, "_blank")
        }
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Velg visning for {componentName}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">

                    {/* Arbeidstegning */}
                    <div className="space-y-2">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                            <Map size={16} /> Arbeidstegning
                        </h4>
                        {drawings.length > 0 ? (
                            <div className="grid gap-2">
                                {drawings.map((doc, i) => (
                                    <Button key={i} variant="outline" className="justify-start w-full text-left font-normal h-auto whitespace-normal break-words p-3 leading-normal" onClick={() => handleOpen(doc)}>
                                        {doc.docTitle}
                                    </Button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-xs italic ml-6">Ingen tegninger funnet</p>
                        )}
                    </div>

                    {/* Systemskjema */}
                    <div className="space-y-2">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                            <FileText size={16} /> Systemskjema
                        </h4>
                        {schemas.length > 0 ? (
                            <div className="grid gap-2">
                                {schemas.map((doc, i) => (
                                    <Button key={i} variant="outline" className="justify-start w-full text-left font-normal h-auto whitespace-normal break-words p-3 leading-normal" onClick={() => handleOpen(doc)}>
                                        {doc.docTitle}
                                    </Button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-xs italic ml-6">Ingen skjema funnet</p>
                        )}
                    </div>

                    {/* Modell */}
                    <div className="space-y-2">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                            <Box size={16} /> 3D Modell
                        </h4>
                        {linkedModels.length > 0 ? (
                            <div className="grid gap-2">
                                {linkedModels.map((m, i) => (
                                    <Button
                                        key={`${m.modelId}-${i}`}
                                        variant="outline"
                                        className="justify-start w-full text-left font-normal h-auto whitespace-normal break-words p-3 leading-normal"
                                        onClick={() => handleOpenModel(m)}
                                    >
                                        {m.modelName}
                                    </Button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-xs italic ml-6">Ingen modell-match funnet</p>
                        )}
                    </div>

                </div>
            </DialogContent>
        </Dialog>
    )
}
