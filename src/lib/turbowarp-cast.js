const Cast = {
    toNumber (value) {
        if (typeof value === 'number') return Number.isNaN(value) ? 0 : value;
        if (typeof value === 'string') {
            value = value.replace(/[０-９＋．ｅ]/g, character =>
                String.fromCharCode(character.charCodeAt(0) - 0xFEE0));
            value = value.replace(/[-－﹣−‐⁃‑‒–—﹘―⎯⏤ーｰ─━]/g, '-');
        }
        const number = Number(value);
        return Number.isNaN(number) ? 0 : number;
    },
    toBoolean (value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value !== '' && value !== '0' && value.toLowerCase() !== 'false';
        }
        return Boolean(value);
    },
    toString (value) {
        return String(value).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    },
    toRgbColorObject (value) {
        if (typeof value === 'string' && value.charAt(0) === '#') {
            const hex = value.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, '$1$1$2$2$3$3');
            const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return match ? {
                r: parseInt(match[1], 16),
                g: parseInt(match[2], 16),
                b: parseInt(match[3], 16)
            } : {r: 0, g: 0, b: 0, a: 255};
        }
        const decimal = this.toNumber(value);
        const alpha = (decimal >> 24) & 0xFF;
        return {
            r: (decimal >> 16) & 0xFF,
            g: (decimal >> 8) & 0xFF,
            b: decimal & 0xFF,
            a: alpha > 0 ? alpha : 255
        };
    },
    toRgbColorList (value) {
        const color = this.toRgbColorObject(value);
        return [color.r, color.g, color.b];
    },
    isWhiteSpace (value) {
        return value === null || (typeof value === 'string' && value.trim().length === 0);
    },
    compare (value1, value2) {
        let number1 = Number(value1);
        let number2 = Number(value2);
        if (number1 === 0 && this.isWhiteSpace(value1)) {
            number1 = NaN;
        } else if (number2 === 0 && this.isWhiteSpace(value2)) {
            number2 = NaN;
        }
        if (Number.isNaN(number1) || Number.isNaN(number2)) {
            const string1 = this.toString(value1).toLowerCase();
            const string2 = this.toString(value2).toLowerCase();
            if (string1 < string2) return -1;
            if (string1 > string2) return 1;
            return 0;
        }
        if ((number1 === Infinity && number2 === Infinity) ||
            (number1 === -Infinity && number2 === -Infinity)) return 0;
        return number1 - number2;
    },
    isInt (value) {
        if (typeof value === 'number') return Number.isNaN(value) || value === parseInt(value, 10);
        if (typeof value === 'boolean') return true;
        if (typeof value === 'string') return value.indexOf('.') < 0;
        return false;
    },
    LIST_INVALID: 'INVALID',
    LIST_ALL: 'ALL',
    toListIndex (index, length, acceptAll) {
        if (typeof index !== 'number') {
            if (index === 'all') return acceptAll ? this.LIST_ALL : this.LIST_INVALID;
            if (index === 'last') return length > 0 ? length : this.LIST_INVALID;
            if (index === 'random' || index === 'any') {
                return length > 0 ? 1 + Math.floor(Math.random() * length) : this.LIST_INVALID;
            }
        }
        const number = Math.floor(this.toNumber(index));
        return number < 1 || number > length ? this.LIST_INVALID : number;
    }
};

export default Cast;
