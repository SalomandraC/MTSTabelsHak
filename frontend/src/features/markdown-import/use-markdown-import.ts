import { useState } from 'react';

import { wikiliveApi } from '../../shared/api/wikilive';

import { parseMarkdown, validateFile } from './md-parser';
import type { ProseMirrorDoc } from './types';

type UseMarkdownImportOptions = {
  spaceId: string;
  onPageCreated: (pageId: string, content: ProseMirrorDoc) => void | Promise<void>;
  onError: (message: string) => void;
};

type UseMarkdownImportResult = {
  isImporting: boolean;
  isModalOpen: boolean;
  selectedFiles: File[];
  modalErrorMessage: string;
  triggerImport: () => void;
  closeImportModal: () => void;
  handleFilesSelect: (files: File[]) => void;
  handleRemoveFile: (index: number) => void;
  submitImport: () => Promise<void>;
};

type ImportSuccess = {
  fileName: string;
  pageId: string;
  content: ProseMirrorDoc;
};

export function useMarkdownImport({
  spaceId,
  onPageCreated,
  onError,
}: UseMarkdownImportOptions): UseMarkdownImportResult {
  const [isImporting, setIsImporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [modalErrorMessage, setModalErrorMessage] = useState('');

  const triggerImport = () => {
    if (isImporting) {
      return;
    }

    setModalErrorMessage('');
    setIsModalOpen(true);
  };

  const closeImportModal = () => {
    if (isImporting) {
      return;
    }

    setIsModalOpen(false);
    setModalErrorMessage('');
    setSelectedFiles([]);
  };

  const handleFilesSelect = (files: File[]) => {
    const acceptedFiles: File[] = [];
    const validationErrors: string[] = [];

    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.ok) {
        validationErrors.push(`${file.name}: ${validation.error}`);
        continue;
      }

      acceptedFiles.push(file);
    }

    if (acceptedFiles.length > 0) {
      setSelectedFiles((current) => appendUniqueFiles(current, acceptedFiles));
    }

    setModalErrorMessage(validationErrors.length > 0 ? buildErrorSummary(validationErrors) : '');
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setModalErrorMessage('');
  };

  const submitImport = async () => {
    if (selectedFiles.length === 0 || isImporting) {
      return;
    }

    setIsImporting(true);
    setModalErrorMessage('');

    const successes: ImportSuccess[] = [];
    const errors: string[] = [];

    try {
      for (const file of selectedFiles) {
        const validation = validateFile(file);
        if (!validation.ok) {
          errors.push(`${file.name}: ${validation.error}`);
          continue;
        }

        try {
          const text = await readFileAsText(file);
          const { title, prosemirrorDoc } = parseMarkdown(text);
          const pageTitle = title ?? file.name.replace(/\.md$/i, '');
          const { page } = await wikiliveApi.createPage(spaceId, pageTitle);

          successes.push({
            fileName: file.name,
            pageId: page.id,
            content: prosemirrorDoc,
          });
        } catch (error) {
          if (error instanceof Error && error.message === 'READ_ERROR') {
            errors.push(`${file.name}: Не удалось прочитать файл`);
          } else {
            errors.push(`${file.name}: Не удалось создать страницу`);
          }
        }
      }

      const lastSuccess = successes[successes.length - 1];
      if (lastSuccess) {
        await onPageCreated(lastSuccess.pageId, lastSuccess.content);
        setIsModalOpen(false);
        setSelectedFiles([]);
      }

      if (errors.length > 0) {
        const summary = buildImportSummary(successes, errors);
        if (lastSuccess) {
          onError(summary);
        } else {
          setModalErrorMessage(summary);
          onError(summary);
        }
      }
    } finally {
      setIsImporting(false);
    }
  };

  return {
    isImporting,
    isModalOpen,
    selectedFiles,
    modalErrorMessage,
    triggerImport,
    closeImportModal,
    handleFilesSelect,
    handleRemoveFile,
    submitImport,
  };
}

function appendUniqueFiles(currentFiles: File[], nextFiles: File[]) {
  const seen = new Set(currentFiles.map(getFileFingerprint));
  const uniqueNextFiles = nextFiles.filter((file) => {
    const fingerprint = getFileFingerprint(file);
    if (seen.has(fingerprint)) {
      return false;
    }

    seen.add(fingerprint);
    return true;
  });

  return [...currentFiles, ...uniqueNextFiles];
}

function getFileFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function buildErrorSummary(errors: string[]) {
  if (errors.length === 1) {
    return errors[0]!;
  }

  const preview = errors.slice(0, 3).join('; ');
  return errors.length > 3 ? `${preview}; и ещё ${errors.length - 3}` : preview;
}

function buildImportSummary(successes: ImportSuccess[], errors: string[]) {
  const errorSummary = buildErrorSummary(errors);

  if (successes.length === 0) {
    return `Импорт не выполнен. ${errorSummary}`;
  }

  if (successes.length === 1) {
    return `Импортировали 1 файл, но часть импорта завершилась с ошибками: ${errorSummary}`;
  }

  return `Импортировали ${successes.length} файла(ов), но часть импорта завершилась с ошибками: ${errorSummary}`;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error('READ_ERROR'));
    reader.readAsText(file, 'utf-8');
  });
}
