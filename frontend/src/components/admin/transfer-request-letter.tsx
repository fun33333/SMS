'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Printer, X } from 'lucide-react';

let html2pdf: any = null;
if (typeof window !== 'undefined') {
  import('html2pdf.js').then((mod) => {
    html2pdf = mod.default;
  });
}

interface TransferRequestLetterProps {
  isOpen: boolean;
  onClose: () => void;
  transferData: {
    entityName: string;
    entityId: string;
    entityType: 'student' | 'teacher';
    fromCampus: string;
    fromShift?: string;
    fromClass?: string;
    toCampus: string;
    toShift?: string;
    toClass?: string;
    reason: string;
    requestedDate: string;
    requestingPrincipal?: string;
    receivingPrincipal?: string;
    transferType: 'campus' | 'shift' | 'class';
  };
}

export function TransferRequestLetter({
  isOpen,
  onClose,
  transferData,
}: TransferRequestLetterProps) {
  if (!transferData || !transferData.entityName || !isOpen) {
    return null;
  }


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getShiftDisplay = (shift?: string) => {
    if (!shift) return '';
    const shiftMap: { [key: string]: string } = {
      M: 'Morning',
      A: 'Afternoon',
      morning: 'Morning',
      afternoon: 'Afternoon',
    };
    return shiftMap[shift] || shift;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    const content = document.getElementById('transfer-letter-content');
    if (!content) {
      return;
    }

    try {
      // Wait for html2pdf to load if not already loaded
      if (!html2pdf) {
        const mod = await import('html2pdf.js');
        html2pdf = mod.default;
      }

      // Create a clone of the content to avoid affecting the displayed version
      const clonedContent = content.cloneNode(true) as HTMLElement;
      
      // Get styles
      const styles = document.getElementById('transfer-letter-styles')?.innerHTML || '';
      
      // Create a temporary container with the letter content
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.width = '210mm'; // A4 width
      tempContainer.innerHTML = `
        <style>
          ${styles}
          .letter-container {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            color: #1a1a1a;
            padding: 20mm;
            background: white;
          }
          body {
            margin: 0;
            padding: 0;
          }
        </style>
        ${clonedContent.outerHTML}
      `;
      
      document.body.appendChild(tempContainer);

      // Configure PDF options
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Transfer_Request_${transferData.entityName.replace(/\s+/g, '_')}_${transferData.entityId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false,
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait' 
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      // Generate and download PDF
      await html2pdf().set(opt).from(tempContainer).save();

      // Clean up temporary container
      document.body.removeChild(tempContainer);

    } catch (error) {
      // Fallback: open print dialog
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const styles = document.getElementById('transfer-letter-styles')?.innerHTML || '';
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Transfer Request Letter</title>
              <style>
                ${styles}
              </style>
            </head>
            <body>
              ${content.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  const currentDate = formatDate(new Date().toISOString());
  const requestedDate = formatDate(transferData.requestedDate);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-8"
      data-transfer-letter-overlay="true"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl print:max-w-none print:max-h-none print:overflow-visible md:p-8">
        <style id="transfer-letter-styles">
          {`
            @media print {
              body * {
                visibility: hidden;
              }
              #transfer-letter-content,
              #transfer-letter-content * {
                visibility: visible;
              }
              #transfer-letter-content {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
              .no-print {
                display: none !important;
              }
            }
            .letter-container {
              font-family: 'Times New Roman', serif;
              /* Slightly tighter line height so more content fits vertically */
              line-height: 1.4;
              color: #1a1a1a;
              /* Constrain to A4 width and center */
              max-width: 210mm;
              margin: 0 auto;
            }
            .letterhead {
              border-bottom: 3px solid #1e40af;
              padding-bottom: 0.5rem;
              margin-bottom: 1.25rem;
            }
            .letterhead-title {
              font-size: 20px;
              font-weight: bold;
              color: #1e40af;
              text-align: center;
              letter-spacing: 1px;
            }
            .letterhead-subtitle {
              font-size: 10px;
              color: #64748b;
              text-align: center;
              margin-top: 0.5rem;
            }
            .letter-date {
              text-align: right;
              margin-bottom: 1.25rem;
              font-size: 12px;
            }
            .recipient-block {
              margin-bottom: 1rem;
            }
            .salutation {
              margin-bottom: 0.75rem;
            }
            .letter-body {
              text-align: justify;
              margin-bottom: 1.25rem;
              font-size: 12px;
            }
            .details-section {
              background: #f8fafc;
              border-left: 4px solid #1e40af;
              padding: 1rem;
              margin: 1rem 0;
              border-radius: 4px;
            }
            /* Table layout for From / To columns – more reliable in PDF rendering */
            .from-to-table {
              width: 100%;
              border-collapse: collapse;
            }
            .from-to-table-cell {
              width: 50%;
              vertical-align: top;
              padding-right: 0.75rem;
            }
            .detail-row {
              margin-bottom: 0.5rem;
              display: flex;
              align-items: start;
            }
            .detail-label {
              font-weight: bold;
              min-width: 160px;
              color: #1e40af;
            }
            .detail-value {
              flex: 1;
              color: #334155;
            }
            .signature-block {
              margin-top: 2rem;
              text-align: right;
            }
            .signature-line {
              border-top: 2px solid #1e40af;
              width: 260px;
              margin: 2rem auto 0.5rem;
              display: block;
            }
            .signature-label {
              font-size: 11px;
              color: #64748b;
              text-align: center;
            }
          `}
        </style>

        <div className="no-print flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            Transfer Request Letter
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div id="transfer-letter-content" className="letter-container bg-white p-8 md:p-12">
          {/* Letterhead */}
          <div className="letterhead">
            <div className="letterhead-title">
              Al Khair Secondary School
            </div>
            <div className="letterhead-subtitle">
              Official Transfer Request Document
            </div>
          </div>

          {/* Date */}
          <div className="letter-date">
            <strong>Date:</strong> {currentDate}
          </div>

          {/* Recipient */}
          <div className="recipient-block">
            <div className="font-semibold mb-1">
              {transferData.receivingPrincipal || 'Principal'}
            </div>
            <div className="text-sm text-gray-700">
              {transferData.toCampus}
            </div>
            {transferData.toCampus !== transferData.fromCampus && (
              <div className="text-sm text-gray-700 mt-1">
                {transferData.toCampus}
              </div>
            )}
          </div>

          {/* Salutation */}
          <div className="salutation">
            <strong>Subject: Request for Transfer of {transferData.entityType === 'student' ? 'Student' : 'Teacher'}</strong>
          </div>

          {/* Body */}
          <div className="letter-body">
            <p className="mb-4">
              <strong>Respected Sir/Madam,</strong>
            </p>

            <p className="mb-4">
              I am writing to formally request your approval for the transfer of the following{' '}
              {transferData.entityType === 'student' ? 'student' : 'teacher'} from{' '}
              <strong>{transferData.fromCampus}</strong> to <strong>{transferData.toCampus}</strong>.
            </p>

            {/* Details Section */}
            <div className="details-section">
              <h3 className="font-bold text-lg mb-4 text-blue-900 border-b border-blue-200 pb-2">
                Transfer Details
              </h3>

              <div className="detail-row">
                <span className="detail-label">
                  {transferData.entityType === 'student' ? 'Student Name:' : 'Teacher Name:'}
                </span>
                <span className="detail-value">{transferData.entityName}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">
                  {transferData.entityType === 'student' ? 'Student ID:' : 'Employee Code:'}
                </span>
                <span className="detail-value">{transferData.entityId}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Transfer Type:</span>
                <span className="detail-value">
                  {transferData.transferType === 'campus'
                    ? 'Campus Transfer'
                    : transferData.transferType === 'shift'
                    ? 'Shift Transfer'
                    : 'Class Transfer'}
                </span>
              </div>

              {/* From / To details side by side - table layout for reliable PDF rendering */}
              <table className="from-to-table mt-2">
                <tbody>
                  <tr>
                    <td className="from-to-table-cell">
                      <p className="mb-2 text-sm font-semibold text-blue-900">From Details</p>
                      <div className="detail-row">
                        <span className="detail-label">From Campus:</span>
                        <span className="detail-value">{transferData.fromCampus}</span>
                      </div>

                      {transferData.fromShift && (
                        <div className="detail-row">
                          <span className="detail-label">From Shift:</span>
                          <span className="detail-value">
                            {getShiftDisplay(transferData.fromShift)}
                          </span>
                        </div>
                      )}

                      {transferData.fromClass && (
                        <div className="detail-row">
                          <span className="detail-label">From Class:</span>
                          <span className="detail-value">{transferData.fromClass}</span>
                        </div>
                      )}
                    </td>

                    <td className="from-to-table-cell">
                      <p className="mb-2 text-sm font-semibold text-blue-900 text-right">
                        To Details
                      </p>
                      <div className="detail-row">
                        <span className="detail-label">To Campus:</span>
                        <span className="detail-value">{transferData.toCampus}</span>
                      </div>

                      {transferData.toShift && (
                        <div className="detail-row">
                          <span className="detail-label">To Shift:</span>
                          <span className="detail-value">
                            {getShiftDisplay(transferData.toShift)}
                          </span>
                        </div>
                      )}

                      {transferData.toClass && (
                        <div className="detail-row">
                          <span className="detail-label">To Class:</span>
                          <span className="detail-value">{transferData.toClass}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="detail-row">
                <span className="detail-label">Requested Date:</span>
                <span className="detail-value">{requestedDate}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Reason for Transfer:</span>
                <span className="detail-value">{transferData.reason}</span>
              </div>
            </div>

            <p className="mb-4">
              This transfer is being requested due to the following reason: <em>"{transferData.reason}"</em>
            </p>

            <p className="mb-4">
              I kindly request your approval for this transfer and assure you that all necessary
              documentation and administrative procedures will be completed in accordance with
              institutional policies.
            </p>

            <p className="mb-4">
              Please find the detailed information above. I look forward to your positive response
              and am available for any further clarification or documentation you may require.
            </p>

            <p className="mb-4">
              Thank you for your time and consideration.
            </p>
          </div>

          {/* Signature Block */}
          <div className="signature-block">
            <div className="text-right mb-8">
              <p className="mb-2">
                <strong>Respectfully,</strong>
              </p>
              <div className="mt-12">
                <div className="signature-line"></div>
                <div className="signature-label">
                  {transferData.requestingPrincipal || 'Requesting Principal'}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {transferData.fromCampus}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-center text-gray-500">
            <p>This is an official document generated by IAK SMS System</p>
            <p className="mt-1">Document ID: TR-{Date.now()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

