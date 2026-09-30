import type React from 'react';
import { Button, type ButtonProps } from './Button';

import { openFileDialog } from "@legendapp/spark/dialogs";

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
      const result = await openFileDialog({ selection: pickFolder ? "directories" : "files", filters: [{ extensions: fileTypes }], prompt });
      const selectedPath = result.canceled ? null : result.paths[0];

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
