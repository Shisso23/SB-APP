import moment from "moment";


export const toMomentDate = (dateString: string)=>{
    const date: Date = new Date(dateString);
    return moment(date);
}

export const currentDate = moment(new Date());