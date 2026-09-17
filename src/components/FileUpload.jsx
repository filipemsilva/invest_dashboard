import React, { useCallback, useState } from 'react';

export default function FileUpload({ onLoad, fileName }) {
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onLoad(e.target.result, file.name);
    reader.readAsText(file, 'UTF-8');
  }, [onLoad]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFile(file);
  }, [handleFile]);

  const handleChange = useCallback((e) => {
    handleFile(e.target.files[0]);
  }, [handleFile]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent-blue)' : 'rgba(255,255,255,0.15)'}`,
        borderRadius: 16,
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        transition: 'all 0.2s',
        background: dragging ? 'rgba(59,130,246,0.08)' : 'transparent',
      }}
      onClick={() => document.getElementById('csv-input').click()}
    >
      <input
        type="file"
        id="csv-input"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" width="36" height="36">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      {fileName ? (
        <>
          <p style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: 14 }}>✓ {fileName}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Clique para carregar outro ficheiro</p>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 14 }}>Arrastar ou clique para carregar CSV</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Formato: separado por ; com decimais ,</p>
        </>
      )}
    </div>
  );
}
