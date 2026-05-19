import React, { useMemo } from 'react'

interface Props {
  image: Uint8Array | null
  alt: string
}

export function ThumbnailPreview({ image, alt }: Props) {
  const src = useMemo(() => {
    if (!image) return null
    const blob = new Blob([image as BlobPart], { type: 'image/png' })
    return URL.createObjectURL(blob)
  }, [image])
  if (!src) return <div className="thumb" aria-label="no preview" />
  return <img className="thumb" src={src} alt={alt} />
}
