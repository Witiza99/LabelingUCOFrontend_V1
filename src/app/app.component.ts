/*******************************Imports***********************************/
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ImageService } from './service/images.service';
import { SpinnerService } from './service/spinner.service';
import { ApiService } from './service/api-service.service';
import * as JSZip from 'jszip';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})

//Class for Main Component APP
export class AppComponent implements OnInit {

  /*******************************Decorators***********************************/
  @Output() receiveSaveCurrentImagefromAPP = new EventEmitter<void>();
  @Output() receiveSaveAllImagesfromAPP = new EventEmitter<void>();
  @Output() receiveExportCurrentImagefromAPP = new EventEmitter<string>();
  @Output() receiveExportAllImagesfromAPP = new EventEmitter<string>();


  /*******************************Variables***********************************/
  showSpinner:boolean = false;
  isModalVisible: boolean = false;
  frameRate: number = 1;

  filesFromHeader: File[] = [];
  videoFilesWithSettings: { file: File, captureInterval: number}[] = [];
  imageToService: File[] = [];

  /*******************************Constructor***********************************/
  constructor(
    private imageService: ImageService,
    private spinnerService: SpinnerService,
    private apiService: ApiService
  ) {}

  /******************************Angular_Functions*******************************/
  ngOnInit(): void {
    this.spinnerService.spinnerState.subscribe(state => {
      this.showSpinner = state;
    });
  }

  /******************************Handle_Functions*******************************/
  handleSaveCurrentImage() {
    this.receiveSaveCurrentImagefromAPP.emit();
  }

  handleSaveAllImages() {
    this.receiveSaveAllImagesfromAPP.emit();
  }

  handleExportCurrentImage(selectedFormat: string) {
    this.receiveExportCurrentImagefromAPP.emit(selectedFormat);
  }

  handleExportAllImages(selectedFormat: string) {
    this.receiveExportAllImagesfromAPP.emit(selectedFormat);
  }

  handleFilesUploaded(files: File[]): void {
    this.filesFromHeader = files;

    //Get videos from file array
    this.videoFilesWithSettings = [];
    this.imageToService = [];
    for (let i = 0; i < this.filesFromHeader.length; i++) {
      const file = this.filesFromHeader[i];
      if (file.type.startsWith('video/')) {
        this.videoFilesWithSettings.push({
          file,
          captureInterval: 1
        });
      }else{
        this.imageToService.push(file);
      }
    }

    //Show modal to manage videos if there are videos
    if (this.videoFilesWithSettings.length > 0){
      this.showModal();
    }else{
      //Call Service to add images
      this.imageService.addImages(this.imageToService);
    }
  }

  /******************************Others_Functions*******************************/
  //Show modal to manage videos
  showModal() {
    this.isModalVisible = true;
  }

  //Remove video file button from modal
  removeFile(i: number): void {
    this.videoFilesWithSettings.splice(i,1);

    if ( this.videoFilesWithSettings.length === 0 && this.imageToService.length === 0){
      this.isModalVisible = false;
    }
  }

  //Cancel button from modal
  cancel(): void {
    this.isModalVisible = false;
  }

  //Confirm button from modal
  async confirm(): Promise<void> {
    this.isModalVisible = false;
    this.spinnerService.show();

    try {
      console.log("Processing video...");
      const frames = await this.extractFrames(this.videoFilesWithSettings);
      console.log("Processing video finished");

      console.log(frames);

      //Merge image with image from video
      this.imageToService.push(...frames);
      //Call image service to add new images
      this.imageService.addImages(this.imageToService);
    } catch (error) {
        console.error("Error processing video frames:", error);
    } finally {
        this.spinnerService.hide();
    }
  }

  //Extract Frames from videoFiles with Framerate
  async extractFrames(videoFilesWithSettings: { file: File, captureInterval: number }[]): Promise<File[]> {
    return new Promise<File[]>((resolve, reject) => {
      const files = videoFilesWithSettings.map(videoFile => videoFile.file);
      const frameRates = videoFilesWithSettings.map(videoFile => videoFile.captureInterval);

      //subscribe to api, process all videos with their framerate
      this.apiService.processVideo(files, frameRates).subscribe({
        next: async (data: Blob) => {
          try {
            //Get blob(ZIP file) and extract images
            console.log("Processing Blob with zip...")
            const imagesFromVideo = await this.extractImagesFromZip(data);
            console.log("End processing Blob with zip...")
            resolve(imagesFromVideo);
          } catch (error) {
            console.error('Error processing files:', error);
            reject(error);
          }
        },
        error: (error) => {
          console.error('Error calling the API:', error);
          reject(error);
        }
      });
    });
  }
  
  // Get blob (ZIP) and return File[] with all images
  async  extractImagesFromZip(zipBlob: Blob): Promise<File[]> {
    try {
        // Create JSZip instance and load the ZIP file
        const zip = await JSZip.loadAsync(zipBlob);
        console.log('ZIP file loaded successfully');

        // Array to save all images with their index
        const extractedFiles: { index: number, frameNumber: number, file: File }[] = [];

        // Iterate through each file in the ZIP
        await Promise.all(
          Object.keys(zip.files).map(async (fileName) => {
              const zipEntry = zip.files[fileName];

              // Check if it's a file and not a directory
              if (!zipEntry.dir) {
                  // Get the file as a Blob
                  const fileData = await zipEntry.async('blob');
                  console.log(`Extracted blob data for file: ${fileName}`);

                  // Create a File object
                  const file = new File([fileData], zipEntry.name, { type: fileData.type });

                  // Extract index and frame number from the file name
                  const idMatch = fileName.match(/(\d+)-frame-(\d+)\.png$/);
                  const index = idMatch ? parseInt(idMatch[1], 10) : -1; // Extract the index
                  const frameNumber = idMatch ? parseInt(idMatch[2], 10) : -1; // Extract the frame number

                  // Log extracted information
                  /*console.log(`Processing file: ${fileName}`);
                  console.log(`Extracted index: ${index}`);
                  console.log(`Extracted frame number: ${frameNumber}`);*/

                  // Add file to the array with index and frame number
                  extractedFiles.push({ index, frameNumber, file });
              }
          })
        );

        // Log the list of files before sorting
        /*console.log('Files before sorting:', extractedFiles.map(item => ({
          fileName: item.file.name,
          index: item.index,
          frameNumber: item.frameNumber
        })));*/

      // Sort files by index and then by frame number
      extractedFiles.sort((a, b) => {
          if (a.index === b.index) {
              return a.frameNumber - b.frameNumber; // Sort by frame number if indices are the same
          }
          return a.index - b.index; // Sort by index
      });

      // Log the list of files after sorting
      /*console.log('Files after sorting:', extractedFiles.map(item => ({
          fileName: item.file.name,
          index: item.index,
          frameNumber: item.frameNumber
      })));*/

      // Return sorted images
      return extractedFiles.map(item => item.file);
    } catch (error) {
        console.error('Error extracting files from ZIP:', error);
        throw error;
    }
  }
}