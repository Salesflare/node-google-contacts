"use strict";

const GD_PREFIX = 'gd:';
const G_CONTACT_PREFIX = 'gContact:';

module.exports = {};

module.exports.AtomToSimple = function(feed) {
    function eachRecursive(object)
    {
        for (var property in object)
        {
            if(property.indexOf('gd:') === 0 || property.indexOf('gContact:') === 0) {
                object[property.replace(':','$')] = object[property];
                delete object[property];
                property = property.replace(':','$');
            }

            if(object[property].$) {
                object[property] = Object.assign({}, object[property], object[property].$);
                delete object[property].$;
            }

            if(!(
                Array.isArray(object) 
                || property.indexOf('gd$') === 0 
                || property.indexOf('gContact$') === 0 
                || property === 'id' 
                || property === 'rel' 
                || property === '$t'
                || property === '_' 
                || property === 'address'
                || property === 'primary'
                || property === 'name'
                || property === 'value')) {
                delete object[property];
                continue;
            }

            if(Object.keys(object[property]).length === 1 && Object.keys(object[property])[0] === '$t') {
                object[property] = object[property]['$t'];
            }

            if(property === 'rel') {
                object['type'] = object[property].split('#')[1];
                delete object[property];
            }

            if (typeof object[property] === "object" && object[property] !== null) {
                eachRecursive(object[property]);
            }

            if (property.indexOf('gd$') === 0 || property.indexOf('gContact$') === 0) {
                object[property.split('$')[1]] = object[property];
                delete object[property];
            }
        }
    }

    function processEntry (entry) {
        eachRecursive(entry);

        entry.id = entry.id.substr(entry.id.lastIndexOf('/') + 1);

        if(entry.phoneNumber && !Array.isArray(entry.phoneNumber)) entry.phoneNumber = [entry.phoneNumber];
        if(entry.organization && !Array.isArray(entry.organization)) entry.organization = [entry.organization];
        if (entry.structuredPostalAddress && !Array.isArray(entry.structuredPostalAddress)) entry.structuredPostalAddress = [entry.structuredPostalAddress];
        if (entry.userDefinedField && !Array.isArray(entry.userDefinedField)) entry.userDefinedField = [entry.userDefinedField];
        if (entry.event && !Array.isArray(entry.event)) entry.event = [entry.event];
        if (entry.relation && !Array.isArray(entry.relation)) entry.relation = [entry.relation];
        if (entry.website && !Array.isArray(entry.website)) entry.website = [entry.website];
        if (entry.im && !Array.isArray(entry.im)) entry.im = [entry.im];
        if (entry.groupMembershipInfo && !Array.isArray(entry.groupMembershipInfo)) entry.groupMembershipInfo = [entry.groupMembershipInfo];
        if (entry.extendedProperty && !Array.isArray(entry.extendedProperty)) entry.extendedProperty = [entry.extendedProperty];        

        if(entry.phoneNumber) {
            entry.phoneNumber.forEach(function (phoneNumber) {
                phoneNumber.phoneNumber = phoneNumber['$t'] || phoneNumber['_'];
                delete phoneNumber['$t'];
                delete phoneNumber['_'];
            });
        }
    }

    if (Array.isArray(feed.entry)) {
        var contacts = [];
        feed.entry.forEach(function (entry) {

            processEntry(entry);

            contacts.push(entry);
        });
        return contacts;
    } else {
        var contact = {};
        processEntry(feed.entry);

        contact = feed.entry;
        return contact;
    }

}

module.exports.SimpleToAtom = function(contact) {
    var prefix = contact.prefix || GD_PREFIX;
    var schemas = {
        xmlns: "http://www.w3.org/2005/Atom",
        gd: "http://schemas.google.com/g/2005",
        gContact: "http://schemas.google.com/contact/2008",
        scheme: "http://schemas.google.com/g/2005#kind",
        term: "http://schemas.google.com/contact/2008#contact",
    };
    var root = {
        $: {
            'xmlns': schemas.xmlns,
            'xmlns:gd': schemas.gd,
            'xmlns:gContact': schemas.gContact
        },
        category: {
            $: {
                'scheme' : schemas.scheme,
                'term' : schemas.term
            }
        }
    };

    if(contact.name) {
        root.name = {
            $: {xmlns: schemas.gd}
        }

        if(contact.name.fullName) root.name.fullName = contact.name.fullName;
        if(contact.name.givenName) root.name.givenName = contact.name.givenName;
        if(contact.name.familyName) root.name.familyName = contact.name.familyName;    
    }

    if(contact.content) root.content = contact.content;
    if(contact.title) root.title = contact.title;
    if(contact.nickname) root.nickname = contact.nickname;
    if(contact.fileAs) root.fileAs = contact.fileAs;
    if(contact.birthday) root.birthday = { $: {when: contact.birthday}};

    if(contact.email){
        root.email = [];
        if(!Array.isArray(contact.email)) contact.email = [contact.email];

        contact.email.forEach(function(m){
            var newEmail = {
                $:{
                    address: m.address
                }
            };

            if(m.primary) newEmail.$.primary = m.primary;
            if(m.label) newEmail.$.label = m.label;
            if(m.type) newEmail.$.rel = schemas.gd + '#' + m.type;
            if(m.rel) newEmail.$.rel = m.rel;

            root.email.push(newEmail);
        });
    }

    if(contact.phoneNumber){
        root.phoneNumber = [];
        if(!Array.isArray(contact.phoneNumber)) contact.phoneNumber = [contact.phoneNumber];

        contact.phoneNumber.forEach(function(p){
            var newPhone = {
                _: p.phoneNumber,
                $: {}
            };

            if(p.label) newPhone.$.label = p.label;
            if(p.type) newPhone.$.rel = schemas.gd + '#' + p.type;
            if(p.rel) newPhone.$.rel = p.rel;

            root.phoneNumber.push(newPhone);
        });
    }

    if (contact.organization) {
        if(!Array.isArray(contact.organization)) contact.organization = [contact.organization];

        root.organization = contact.organization.map(function(o){
            var org = {
                $: {},
                orgName: o.orgName,
                orgTitle: o.orgTitle
            };

            if(o.type) org.$.rel = schemas.gd + '#' + o.type;
            if(o.rel) org.$.rel = o.rel;

            return _addPrefix(org, prefix);
        });
    }

    if (contact.structuredPostalAddress) {
        if (!Array.isArray(contact.structuredPostalAddress)) contact.structuredPostalAddress = [contact.structuredPostalAddress];

        root.structuredPostalAddress = contact.structuredPostalAddress.map(function (a) {
            var address = {
                $: {},
                formattedAddress: a.formattedAddress
            };

            if(a.label) address.$.label = a.label;
            if(a.type) address.$.rel = schemas.gd + '#' + a.type;
            if(a.rel) address.$.rel = a.rel;
            
            return _addPrefix(address, prefix);
        });
    }

    if (contact.userDefinedField) {
        if (!Array.isArray(contact.userDefinedField)) contact.userDefinedField = [contact.userDefinedField];
        root.userDefinedField = contact.userDefinedField.map(function (field) {
            return {
                $: {
                    key: field.key,
                    value: field.value
                }
            };
        });
    }

    if (contact.event) {
        if (!Array.isArray(contact.event)) contact.event = [contact.event];
        root.event = contact.event.map(function (event) {
            var evt = {
                $:{},
                when: {
                    $: {startTime: event.when}
                }
            };

            if(event.label) evt.$.label = event.label;
            if(event.type) evt.$.rel = event.type;
            if(event.rel) evt.$.rel = event.rel;

            return _addPrefix(evt, prefix);
        });
    }

    if (contact.relation) {
        if (!Array.isArray(contact.relation)) contact.relation = [contact.relation];
        root.relation = contact.relation.map(function (relation) {
            var rel = {
                $:{},
                _: relation.relation
            };

            if(relation.label) rel.$.label = relation.label;
            if(relation.type) rel.$.rel = relation.type;
            if(relation.rel) rel.$.rel = relation.rel;

            return rel;
        });
    }

    if (contact.website) {
        if (!Array.isArray(contact.website)) contact.website = [contact.website];
        root.website = contact.website.map(function (website) {
            var web = {
                $:{
                    href: website.href
                }
            };

            if(website.primary) web.$.primary = website.primary;
            if(website.label) web.$.label = website.label;
            if(website.type) web.$.rel = website.type;
            if(website.rel) web.$.rel = website.rel;

            return web;
        });
    }

    if (contact.im) {
        if (!Array.isArray(contact.im)) contact.im = [contact.im];
        root.im = contact.im.map(function (im) {
            var ob = {
                $:{
                    address:im.address
                }
            };

            if(im.protocol) ob.$.protocol = im.protocol;
            if(im.label) ob.$.label = im.label;
            if(im.type) ob.$.rel = im.type;
            if(im.rel) ob.$.rel = im.rel;

            return ob;
        });
    }

    if (contact.groupMembershipInfo) {
        if (!Array.isArray(contact.groupMembershipInfo)) contact.groupMembershipInfo = [contact.groupMembershipInfo];
        root.groupMembershipInfo = contact.groupMembershipInfo.map(function (membershipInfo) {
            var info = {
                $: { href: membershipInfo.href }
            };

            if(membershipInfo.deleted) info.$.deleted = membershipInfo.deleted;

            return info;
        });
    }

    if (contact.extendedProperty) {
        if (!Array.isArray(contact.extendedProperty)) contact.extendedProperty = [contact.extendedProperty];
        root.extendedProperty = contact.extendedProperty.map(function (field) {
            return {
                $: {
                    name: field.name,
                    value: field.value
                }
            };
        });
    }    

    return _addPrefix(root, prefix);

    function _addPrefix(obj, prefix){
        var prefixedObj = {};
        Object.entries(obj).forEach(function([key, value]){
            if(['name', 'email', 'phoneNumber', 'organization', 'orgName', 'orgTitle', 'structuredPostalAddress', 'formattedAddress', 'extendedProperty', 'when'].indexOf(key) > - 1) {
                key = prefix + key;
            } else if(['nickname', 'userDefinedField', 'fileAs', 'birthday', 'event', 'relation', 'website', 'im', 'groupMembershipInfo'].indexOf(key) > - 1) {
                key = G_CONTACT_PREFIX + key;
            }

            prefixedObj[key] = value;
        });

        return prefixedObj;
    }
}