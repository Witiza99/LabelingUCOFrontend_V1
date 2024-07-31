/*******************************Imports***********************************/
import { Injectable } from '@angular/core';
import { Subject, Observable, firstValueFrom } from 'rxjs';
import { ImageWithMetadata } from '../interface/imagewithmetadata';
import { Shape } from '../interface/shape';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import * as ExifReader from 'exifreader';
import { ApiService } from './api-service.service';
import { SpinnerService } from './spinner.service';
import { ExportService } from './export.service';


@Injectable({
  providedIn: 'root'
})

//Service to manage all Images
export class ImageService {
  /*******************************Variables***********************************/
  private images: ImageWithMetadata[] = [];
  private selectedImageIndex: number | null = null; // index image for process image
  private imagesSubject = new Subject<ImageWithMetadata[]>();
  private indexSubject = new Subject<number | null>();

  /*******************************Constructor***********************************/
  constructor(
    private spinnerService: SpinnerService ,
    private apiService: ApiService,
    private exportService: ExportService
  ) {}

  /************************Getter_and_Setter_Funtions***************************/
  getImages(): ImageWithMetadata[] {
    return this.images;
  }

  //observer for image with metadata vector
  getImagesObservable(): Observable<ImageWithMetadata[]> {
    return this.imagesSubject.asObservable();
  }

  //observer for index
  getIndexObservable(): Observable<number | null> {
    return this.indexSubject.asObservable();
  }

  //index of image processing
  setSelectedImageIndex(index: number | null): void {
    this.selectedImageIndex = index;
    this.indexSubject.next(this.selectedImageIndex);
  }

  /******************************Others_Functions*******************************/
  //add new image with or without metadata
  async addImages(files: File[]): Promise<void> {
    for (const file of files) {
      try {
        const metadata = await this.extractMetadataFromImage(file);
        const imageWithMetadata: ImageWithMetadata = { file, metadata };
        this.images.push(imageWithMetadata);
        console.log("Image with metadatos");
      } catch (error) {
        console.log(error)
        // If not possible get metadata from image, save image without metadata
        const imageWithMetadata: ImageWithMetadata = { file, metadata: null };
        this.images.push(imageWithMetadata);
        console.log("Image without metadatos");
      }
    }
    this.imagesSubject.next([...this.images]);
  }

  //delete image from the tool
  deleteImage(index: number): void {
    if (index >= 0 && index < this.images.length) {
      this.images.splice(index, 1);
      this.imagesSubject.next([...this.images]);
    }
  }

  //Updata metadata
  updateMetadata(metadata: any): void {
    if(this.selectedImageIndex!= null){
      this.images[this.selectedImageIndex].metadata = metadata;
      this.imagesSubject.next([...this.images]);
    }else{console.log("Its not possible save metadata")}
  }
  
  //Methot for merge json metadata with a file
  async embedJsonInImage(imageFile: File, jsonData: string): Promise<File> {
    try {
      // Send data to backend and wait response (imagen with metadata)
      const response = await  firstValueFrom(this.apiService.embedInfoInImage(imageFile, jsonData));

      // Check if response is undefined and valid blob
      if (!(response instanceof Blob)) {
          throw new Error('Answer is not valid blob');
      }

      // Transform blob to file
      const modifiedFile = new File([response], imageFile.name, {
          type: response.type,
          lastModified: Date.now()
      });
      return modifiedFile;

    } catch (error) {
        console.error('Error embedding Json in image:', error);
        throw error;
    }
  }

  //Methot for extract json metadata from a file
  async extractMetadataFromImage(image: File): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event: any) => {
        try {
          const arrayBuffer = event.target.result;

          // Use ExifReader to get metadat
          const tags = ExifReader.load(arrayBuffer);

          if (tags && tags['UserComment']) {
            const userComment = tags['UserComment'].description;
            
            try {
              const shapes = JSON.parse(userComment);
              resolve(shapes);
            } catch (error) {
              reject('Error to transform UserComment to shapes.');
            }
          } else {
            reject('UserComment is not find on metadata from image.');
          }
        } catch (error) {
          console.error('Error processing metadata EXIF:', error);
          reject('Error processing metadata EXIF.');
        }
      };

      reader.onerror = (error) => {
        console.error('Error readding file:', error);
        reject('Error readding file.');
      };

      reader.readAsArrayBuffer(image);
    });
  }   

  //transform shape to json
  private shapesToJson(shapes: Shape[]): string {
    const json = JSON.stringify(shapes);
    return json;
  }

  //save image withmetada for download
  async saveImageWithMetadata(): Promise<void> {
    if (this.selectedImageIndex != null) {
      const imageWithMetadata = this.images[this.selectedImageIndex];
      this.spinnerService.show();
      if (imageWithMetadata.metadata) {
        const jsonMetadata = this.shapesToJson(imageWithMetadata.metadata);
        const imgWithMetadataembed = await this.embedJsonInImage(imageWithMetadata.file, jsonMetadata);
        this.downloadImage(imgWithMetadataembed);
      } else {
        //console.log("Download imagen without metadata");
        this.downloadImage(imageWithMetadata.file);
      }
      this.spinnerService.hide();
    }
  }
  //save all images withmetada for download
  async saveAllImagesWithMetadata(): Promise<void> {
    const zip = new JSZip();
    this.spinnerService.show();
    for (const imageWithMetadata of this.images) {
      try {
        if (imageWithMetadata.metadata) {
          const jsonMetadata = this.shapesToJson(imageWithMetadata.metadata);
          const imgWithMetadata = await this.embedJsonInImage(imageWithMetadata.file, jsonMetadata);
          zip.file(imageWithMetadata.file.name, imgWithMetadata);
        } else {
          zip.file(imageWithMetadata.file.name, imageWithMetadata.file);
        }
      } catch (error) {
        console.error(`Error saving image`);
      }
    }
  
    // Generate and download ZIP file
    zip.generateAsync({ type: 'blob' })
      .then((content) => {
        saveAs(content, 'images.zip');
      })
      .catch((error) => {
        console.error('Error creating ZIP file:', error);
      });
      this.spinnerService.hide();
    
  }

  private downloadImage(file: File): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // Generate and download ZIP file with format
  async exportSelectedImage(selectedFormat: string): Promise<void> {
    if (this.selectedImageIndex !== null) {
      const imageWithMetadata = this.images[this.selectedImageIndex];

      let imageToExport: ImageWithMetadata;
      if (imageWithMetadata.metadata) {
        const jsonMetadata = this.shapesToJson(imageWithMetadata.metadata);
        const imgWithMetadataembed = await this.embedJsonInImage(imageWithMetadata.file, jsonMetadata);
        imageToExport = {file: imgWithMetadataembed, metadata: imageWithMetadata.metadata};
      } else {
        //console.log("Download imagen without metadata");
        imageToExport = {file: imageWithMetadata.file, metadata: imageWithMetadata.metadata};
      }
      
      await this.exportService.exportImageWithFormat(imageToExport, selectedFormat);
    } else {
      console.error('No image selected');
    }
  }

  // Generate and download ZIP file for all images with format
  async exportAllImages(selectedFormat: string): Promise<void> {
    // Array to hold the processed images
    const processedImages: ImageWithMetadata[] = [];

    // Iterate over each image in the `this.images` array
    for (const imageWithMetadata of this.images) {
        let imageToExport: ImageWithMetadata;

        if (imageWithMetadata.metadata) {
            const jsonMetadata = this.shapesToJson(imageWithMetadata.metadata);
            const imgWithMetadataEmbed = await this.embedJsonInImage(imageWithMetadata.file, jsonMetadata);
            imageToExport = { file: imgWithMetadataEmbed, metadata: imageWithMetadata.metadata };
        } else {
            imageToExport = { file: imageWithMetadata.file, metadata: imageWithMetadata.metadata };
        }
        processedImages.push(imageToExport);
    }
    // Export all processed images with the selected format
    await this.exportService.exportAllImagesWithFormat(processedImages, selectedFormat);
  }

}
