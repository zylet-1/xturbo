import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import extensionLibraryContent from '../lib/libraries/extensions/index.jsx';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';
import {loadCustomExtensionFile, loadCustomExtensionURL} from '../lib/load-custom-extension.js';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    },
    extensionUrl: {
        defaultMessage: 'Enter the URL of the extension',
        description: 'Prompt for unoffical extension url',
        id: 'gui.extensionLibrary.extensionUrl'
    }
});

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect',
            'handleExtensionFileSelect'
        ]);
    }
    handleItemSelect (item) {
        if (item.extensionFileLoader) {
            this.handleExtensionFileSelect();
            return;
        }
        if (item.extensionLoader) {
            // eslint-disable-next-line no-alert
            const input = prompt(this.props.intl.formatMessage(messages.extensionUrl));
            if (!input) return;
            const url = input.trim();
            if (!url) return;

            loadCustomExtensionURL(url, this.props.vm)
                .then(extensionId => this.props.onCategorySelected(extensionId))
                .then(() => this.props.onRequestClose())
                .catch(error => {
                    // eslint-disable-next-line no-alert
                    alert(`Could not load extension: ${(error && error.message) || error || 'Unknown error'}`);
                });
            return;
        }

        if (item.customExtension) {
            loadCustomExtensionURL(item.extensionURL, this.props.vm)
                .then(extensionId => this.props.onCategorySelected(extensionId))
                .catch(error => {
                    // eslint-disable-next-line no-alert
                    alert(`Could not load extension: ${(error && error.message) || error || 'Unknown error'}`);
                });
            return;
        }

        const id = item.extensionId;
        let url = item.extensionURL ? item.extensionURL : id;
        if (!item.disabled && !id) {
            // eslint-disable-next-line no-alert
            url = prompt(this.props.intl.formatMessage(messages.extensionUrl));
        }
        if (id && !item.disabled) {
            if (this.props.vm.extensionManager.isExtensionLoaded(id)) {
                this.props.onCategorySelected(id);
            } else {
                this.props.vm.extensionManager.loadExtensionURL(url).then(() => {
                    this.props.onCategorySelected(id);
                });
            }
        }
    }
    handleExtensionFileSelect () {
        const vm = this.props.vm;
        const onCategorySelected = this.props.onCategorySelected;
        const onRequestClose = this.props.onRequestClose;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.js,.mjs,application/javascript,text/javascript';
        input.style.display = 'none';
        input.onchange = () => {
            const file = input.files && input.files[0];
            input.remove();
            if (!file) return;

            loadCustomExtensionFile(file, vm).then(extensionId => {
                onCategorySelected(extensionId);
                onRequestClose();
            }).catch(error => {
                // eslint-disable-next-line no-alert
                alert(`Could not load extension file: ${(error && error.message) || error || 'Unknown error'}`);
            });
        };
        document.body.appendChild(input);
        input.click();
    }
    render () {
        const extensionLibraryThumbnailData = extensionLibraryContent.map(extension => ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        }));
        return (
            <LibraryComponent
                data={extensionLibraryThumbnailData}
                filterable
                id="extensionLibrary"
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

ExtensionLibrary.propTypes = {
    intl: intlShape.isRequired,
    onCategorySelected: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);
