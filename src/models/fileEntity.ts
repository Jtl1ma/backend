/*import { PrimaryGeneratedColumn, Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { MessageEntity } from './messageEntity';

// type FileEntity = {

@Entity('files')
export class FileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  url: string;

  @Column()
  originalName: string;

  @Column()
  fileType: string;

  @ManyToOne(() => MessageEntity, (message) => message.files)
  @JoinColumn({ name: 'messageId' })
  message?: MessageEntity;

  @Column({ nullable: true })
  messageId?: string;

 /* constructor(originalName: string, fileType: string) {
    this.originalName = originalName;
    this.fileType = fileType;
  }*/
//}