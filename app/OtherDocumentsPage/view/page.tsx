'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import OtherDocumentViewPageImpl from '../../../src/ui-pages/OtherDocumentViewPage.jsx';

export const dynamic = 'force-dynamic';

function OtherDocumentViewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocument = async () => {
      try {
        const documentId = searchParams.get('id');
        if (!documentId) {
          setError('No document ID provided');
          setLoading(false);
          return;
        }

        const timestamp = new Date().getTime();
        const response = await fetch(`/api/other-documents/${encodeURIComponent(documentId)}?_t=${timestamp}`, {
          cache: 'no-store',
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
            setError('Document not found');
          } else {
            const errData = await response.json();
            setError(errData.error || 'Failed to load document');
          }
          setLoading(false);
          return;
        }

        const data = await response.json();
        if (data.document) {
          setDocument(data.document);
        } else {
          setError('Document not found');
        }
      } catch (err: any) {
        console.error('Error loading document:', err);
        setError(err.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [searchParams]);

  const handleBack = () => {
    const from = searchParams.get('from');
    if (from) {
      router.replace(from);
    } else {
      router.replace('/OtherDocumentsPage');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#357ab2' }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
          Loading document...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#dc2626', marginBottom: '16px' }}>
          <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
          {error}
        </div>
        <button
          onClick={handleBack}
          style={{
            padding: '8px 16px',
            borderRadius: '12px',
            border: '1px solid #357ab2',
            backgroundColor: '#fff',
            color: '#357ab2',
            cursor: 'pointer'
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!document) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Document not found</div>
        <button
          onClick={handleBack}
          style={{
            marginTop: '16px',
            padding: '8px 16px',
            borderRadius: '12px',
            border: '1px solid #357ab2',
            backgroundColor: '#fff',
            color: '#357ab2',
            cursor: 'pointer'
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <OtherDocumentViewPageImpl
      document={document}
      onBack={handleBack}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#357ab2' }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
          Loading...
        </div>
      </div>
    }>
      <OtherDocumentViewContent />
    </Suspense>
  );
}
