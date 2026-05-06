declare global {
  interface Window {
    $3Dmol: {
      createViewer: (element: HTMLElement, config: any) => any;
      SurfaceType: {
        VDW: string;
        MS: string;
        SAS: string;
        SES: string;
      };
      Gradient: {
        RWB: any;
      };
    };
  }
}

export { }; 