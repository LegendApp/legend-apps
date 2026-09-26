import type React from 'react';
import { Button, type ButtonProps } from './Button';

import { openFileDialog } from "@legendapp/spark/dialogs";
const NativeFilePicker = {
  async pickFolder() { return (await openFileDialog({canChooseFiles: false, canChooseDirectories: true}))?.[0] ?? null; },
  async pickFileWithFilenameExtension(allowedFileTypes: string[], prompt: string) { return (await openFileDialog({allowedFileTypes, prompt}))?.[0] ?? null; },
};

interface FilePickerProps extends Pick<ButtonProps, 'bezelStyle' | 'controlSize'> {
  onFileSelected?: (path: string) => void;
  onCancel?: () => void;
  fileTypes?: string[];
  prompt?: string;
  title: string;
  pickFolder?: boolean;
}

export const FilePicker: React.FC<FilePickerProps> = ({
  onFileSelected,
  onCancel,
  fileTypes = [],
  prompt = 'Select',
  title,
  pickFolder = false,
}) => {
  const handlePress = async () => {
    try {
      let selectedPath: string | null;

      if (pickFolder) {
        selectedPath = await NativeFilePicker.pickFolder();
      } else {
        selectedPath = await NativeFilePicker.pickFileWithFilenameExtension(fileTypes, prompt);
      }

      if (selectedPath) {
        onFileSelected?.(selectedPath);
      } else {
        onCancel?.();
      }
    } catch (error: any) {
      if (error.message !== 'NSModalResponseCancel') {
        console.error('Error picking file:', error);
      }
      onCancel?.();
    }
  };

  return <Button title={title} onPress={handlePress} />;
};
