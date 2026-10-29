export default (filename, blob) => {
    // Android's WebView does not handle Blob downloads through its normal
    // download listener. Let the native app show Android's Save As dialog.
    if (window.ScratchAndroid && typeof window.ScratchAndroid.saveFile === 'function') {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result;
            const base64 = typeof dataUrl === 'string' ? dataUrl.split(',')[1] : '';
            window.ScratchAndroid.saveFile(filename, blob.type || 'application/octet-stream', base64);
        };
        reader.readAsDataURL(blob);
        return;
    }

    const downloadLink = document.createElement('a');
    document.body.appendChild(downloadLink);

    // Use special ms version if available to get it working on Edge.
    if (navigator.msSaveOrOpenBlob) {
        navigator.msSaveOrOpenBlob(blob, filename);
        return;
    }

    if ('download' in HTMLAnchorElement.prototype) {
        const url = window.URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.type = blob.type;
        downloadLink.click();
        // remove the link after a timeout to prevent a crash on iOS 13 Safari
        window.setTimeout(() => {
            document.body.removeChild(downloadLink);
            window.URL.revokeObjectURL(url);
        }, 1000);
    } else {
        // iOS 12 Safari, open a new page and set href to data-uri
        let popup = window.open('', '_blank');
        const reader = new FileReader();
        reader.onloadend = function () {
            popup.location.href = reader.result;
            popup = null;
        };
        reader.readAsDataURL(blob);
    }

};
