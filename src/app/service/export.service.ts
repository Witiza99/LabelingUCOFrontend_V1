/*******************************Imports***********************************/
import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ImageWithMetadata } from '../interface/imagewithmetadata';

@Injectable({
  providedIn: 'root'
})
//Service to Export images
export class ExportService {
  /*******************************Constructor***********************************/
  constructor() { }

  /******************************Others_Functions*******************************/
  async exportImageWithFormat(imageWithMetadata: ImageWithMetadata, format: string): Promise<void> {
    if (format === 'yolo') {
      await this.exportAsYOLO(imageWithMetadata);
    }
    // Add more formats
  }

  async exportAllImagesWithFormat(imagesWithMetadata: ImageWithMetadata[], format: string): Promise<void> {
    if (format === 'yolo') {
      await this.exportAllAsYOLO(imagesWithMetadata);
    }
    // Add more formats
  }

  //export yolo format 1 image
  private async exportAsYOLO(imageWithMetadata: ImageWithMetadata): Promise<void> {
    const zip = new JSZip();
    
    const image = imageWithMetadata.file;
    const annotations = this.metadataToYOLO(imageWithMetadata.metadata);
    const annotationFileName = image.name.replace(/\.[^/.]+$/, '.txt'); // Cambia extensión a .txt

    zip.file(`${image.name}`, image);
    zip.file(`${annotationFileName}`, annotations);

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${image.name.split('.')[0]}_yolo.zip`);
  }

  //export yolo format all images
  private async exportAllAsYOLO(imagesWithMetadata: ImageWithMetadata[]): Promise<void> {
    const zip = new JSZip();

    for (const imageWithMetadata of imagesWithMetadata) {
      const image = imageWithMetadata.file;
      const annotations = this.metadataToYOLO(imageWithMetadata.metadata);
      const annotationFileName = image.name.replace(/\.[^/.]+$/, '.txt'); // Cambia extensión a .txt

      zip.file(`images/${image.name}`, image);
      zip.file(`labels/${annotationFileName}`, annotations);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'images_yolo.zip');
  }

  //use yolo format (darknet)
  private metadataToYOLO(metadata: any[] | null): string {
    if (!metadata || metadata.length === 0) {
      return ''; // Devuelve una cadena vacía si no hay metadatos
    }

    return metadata.map(rect => {
      return `${rect.label} ${rect.x} ${rect.y} ${rect.width} ${rect.height}`;
    }).join('\n');
  }
}
